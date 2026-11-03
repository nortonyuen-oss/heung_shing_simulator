// 區外連線 (docs/region-connections-design.md): a road that reaches the map edge and joins the
// city's network links the district to its neighbour on that side. Each month people commute
// out to work (easing unemployment, lifting residential demand), workers commute in to fill
// spare jobs (lifting commercial and industrial demand), visitors come across, and industry
// ships its goods out - all as city totals, capped by how many lanes the edge roads have, with
// the traffic they bring loaded onto those roads. A container port carries goods and an airport
// brings visitors, connected or not. Neighbours come from real geography on Hong Kong maps
// (city.regionNeighbours, set at founding); elsewhere every side is a neutral 鄰區.

const REGION_SIDES = Object.freeze(['n', 'e', 's', 'w']);
const REGION_NEIGHBOUR_MAX_METRES = 9000;
const REGION_CONNECTION_MIN_NETWORK = 6;   // road tiles an edge road must reach to count
const REGION_CONNECTION_MAX_LANES = 4;
const REGION_TUNING = Object.freeze({
  laneCapacity: 1200,          // commuters a month, each lane, both ways together
  commuteOutShare: 0.6,        // of the unemployed, before the neighbours' job pull
  commuteInShare: 0.5,         // of the unfilled jobs
  bedroomDemand: 0.06,         // residential demand at full out-commuting
  commuteInDemand: 0.06,       // commercial / industrial demand at full in-commuting
  noGoodsRoutePenalty: 0.06,   // industrial demand lost with no road out and no port
  visitorsPerConnection: 0.06, // tourism capacity share each road connection adds
  visitorsMax: 0.3,
  airportVisitors: 0.15,
  trafficPerLane: 60,          // traffic load at the edge tile when a lane is fully used
});

let regionConnectionCache = { key: '', connections: [] };
let regionSignKey = '';

function getRegionNeighbours() {
  const stored = typeof city !== 'undefined' ? city.regionNeighbours : null;
  return Object.fromEntries(REGION_SIDES.map((side) => [side, typeof stored?.[side] === 'string' ? stored[side] : null]));
}

// The four sides' neighbouring districts for a new city: the nearest Hong Kong district map
// centre in each direction (within 9 km and 50 degrees of it), or null for a neutral 鄰區.
// For a 香港實景 window the sides are turned and mirrored with the window.
function computeRegionNeighbours({ districtId = '', features = [] } = {}) {
  const maps = typeof HK_DISTRICT_MAPS !== 'undefined' ? HK_DISTRICT_MAPS : [];
  let centre = null;
  let sideVector = (side) => ({ n: [0, 1], e: [1, 0], s: [0, -1], w: [-1, 0] })[side];
  const district = maps.find((entry) => entry.id === districtId);
  if (district) {
    centre = { e: district.centre.e, n: district.centre.n };
  } else {
    const sample = (features || []).map((f) => /^hk-sample:(\d+),(\d+),(\d)(m?)$/.exec(String(f))).find(Boolean);
    const tiles = typeof HK_TERRAIN_TILES !== 'undefined' ? HK_TERRAIN_TILES : null;
    if (sample && tiles) {
      const [col0, row0, turns, mirror] = [Number(sample[1]), Number(sample[2]), Number(sample[3]), sample[4] === 'm'];
      const last = MAP_WIDTH - 1;
      // The window tile an output tile shows (as sampleHkTerrain reads it)
      const source = (row, col) => {
        const c = mirror ? last - col : col;
        if (turns === 1) return [c, last - row];
        if (turns === 2) return [last - row, last - c];
        if (turns === 3) return [last - c, row];
        return [row, c];
      };
      const toWorld = ([row, col]) => [
        tiles.westE + (col0 + col) * tiles.tileMetres,
        tiles.northN - (row0 + row) * tiles.tileMetres,
      ];
      const [ce, cn] = toWorld(source(last / 2, last / 2));
      centre = { e: ce, n: cn };
      const edgeMid = { n: [0, last / 2], e: [last / 2, last], s: [last, last / 2], w: [last / 2, 0] };
      sideVector = (side) => {
        const [e, n] = toWorld(source(...edgeMid[side]));
        const length = Math.hypot(e - ce, n - cn) || 1;
        return [(e - ce) / length, (n - cn) / length];
      };
    }
  }
  const result = { n: null, e: null, s: null, w: null };
  if (!centre) return result;
  REGION_SIDES.forEach((side) => {
    const [vx, vy] = sideVector(side);
    let best = null;
    let bestDistance = REGION_NEIGHBOUR_MAX_METRES;
    maps.forEach((entry) => {
      if (entry.id === districtId) return;
      const dx = entry.centre.e - centre.e;
      const dy = entry.centre.n - centre.n;
      const distance = Math.hypot(dx, dy);
      if (distance < 1500 || distance > bestDistance) return;
      if ((dx * vx + dy * vy) / distance < Math.cos((50 * Math.PI) / 180)) return;
      best = entry.id;
      bestDistance = distance;
    });
    result[side] = best;
  });
  return result;
}

function getRegionNeighbourName(districtId, language = typeof currentLanguage !== 'undefined' ? currentLanguage : 'en') {
  const info = districtId && typeof HK_DISTRICT_INFO !== 'undefined' ? HK_DISTRICT_INFO[districtId] : null;
  if (info) return info.names?.[language] ?? info.names?.en;
  // a neutral 鄰區, in the language asked for (the sign's English line asks for 'en')
  const generic = typeof I18N !== 'undefined' ? I18N[language]?.['region.generic'] : null;
  return generic ?? t('region.generic');
}

// Edge roads that leave the map and join the city's network, one connection per run of adjacent
// edge tiles (the lanes of a carriageway).
function detectRegionConnections() {
  const roads = [];
  const edges = {
    n: (i) => [0, i],
    s: (i) => [MAP_HEIGHT - 1, i],
    w: (i) => [i, 0],
    e: (i) => [i, MAP_WIDTH - 1],
  };
  // An edge road counts only where it leaves the map head-on (tile-keys.js), as it is drawn
  const leaves = (side, row, col) => getRoadEdgeExitSide(row, col) === side;
  REGION_SIDES.forEach((side) => {
    for (let i = 0; i < MAP_WIDTH; i++) {
      const [row, col] = edges[side](i);
      if (leaves(side, row, col)) roads.push(`${side}:${i}`);
    }
  });
  // the road count too: an edge road joins the network only once the roads behind it are built
  const roadCount = typeof roadTileCount === 'number' ? roadTileCount : 0;
  const key = `${roads.join('|')}#${roadCount}`;
  if (key === regionConnectionCache.key) return regionConnectionCache.connections;

  const reachesNetwork = (row, col) => {
    const seen = new Set([row * MAP_WIDTH + col]);
    const queue = [[row, col]];
    while (queue.length && seen.size < REGION_CONNECTION_MIN_NETWORK) {
      const [r, c] = queue.shift();
      for (const [nr, nc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
        const id = nr * MAP_WIDTH + nc;
        if (!isInsideMap(nr, nc) || seen.has(id) || !isRoadTile(nr, nc)) continue;
        seen.add(id);
        queue.push([nr, nc]);
      }
    }
    return seen.size >= REGION_CONNECTION_MIN_NETWORK;
  };

  const connections = [];
  REGION_SIDES.forEach((side) => {
    let run = null;
    for (let i = 0; i <= MAP_WIDTH; i++) {
      const [row, col] = i < MAP_WIDTH ? edges[side](i) : [-1, -1];
      if (i < MAP_WIDTH && leaves(side, row, col)) {
        if (!run) run = { side, tiles: [] };
        run.tiles.push([row, col]);
        continue;
      }
      if (run && run.tiles.some(([r, c]) => reachesNetwork(r, c))) {
        const [midRow, midCol] = run.tiles[Math.floor(run.tiles.length / 2)];
        connections.push({
          side,
          lanes: Math.min(REGION_CONNECTION_MAX_LANES, run.tiles.length),
          tiles: run.tiles,
          row: midRow,
          col: midCol,
        });
      }
      run = null;
    }
  });
  regionConnectionCache = { key, connections };
  return connections;
}

// How strongly the neighbours on the connected sides pull workers and send visitors, from
// their 地區特色 (district-profiles.js); a neutral 鄰區 is 1.
function getRegionNeighbourPull(connections, neighbours) {
  const sides = [...new Set(connections.map((connection) => connection.side))];
  if (!sides.length) return { jobs: 1, residents: 1, tourism: 1 };
  const step = (id, axis) => (typeof getDistrictProfileStep === 'function' && id ? getDistrictProfileStep(axis, getDistrictProfile(id)) : 0);
  const average = (fn) => sides.reduce((sum, side) => sum + fn(neighbours[side]), 0) / sides.length;
  return {
    jobs: 1 + 0.12 * average((id) => step(id, 'demandC') + step(id, 'demandI') + step(id, 'jobs')),
    residents: 1 + 0.12 * average((id) => step(id, 'demandR') + step(id, 'density')),
    tourism: 1 + 0.15 * average((id) => step(id, 'tourism') + step(id, 'environment')),
  };
}

// This month's cross-district flows from the city's labour market (called from updateDemand).
function computeRegionFlows({ labourForce = 0, jobs = 0, industrialCount = 0 } = {}) {
  const connections = detectRegionConnections();
  const neighbours = getRegionNeighbours();
  const pull = getRegionNeighbourPull(connections, neighbours);
  const lanes = connections.reduce((sum, connection) => sum + connection.lanes, 0);
  const capacity = lanes * REGION_TUNING.laneCapacity;
  const clampShare = (value) => Math.max(0, Math.min(1, value));

  const unemployed = Math.max(0, labourForce - jobs);
  const out = Math.round(Math.min(capacity, unemployed * REGION_TUNING.commuteOutShare * Math.max(0.4, pull.jobs)));
  const spareJobs = Math.max(0, jobs - labourForce);
  const into = Math.round(Math.min(Math.max(0, capacity - out), spareJobs * REGION_TUNING.commuteInShare * Math.max(0.4, pull.residents)));
  const hasPort = typeof hasBuildingType === 'function' && hasBuildingType('container_port');
  const hasAirport = typeof hasBuildingType === 'function' && hasBuildingType('airport');
  const goodsRoute = connections.length > 0 ? 'road' : hasPort ? 'port' : 'none';
  const visitors = Math.min(REGION_TUNING.visitorsMax, connections.length * REGION_TUNING.visitorsPerConnection * Math.max(0.4, pull.tourism))
    + (hasAirport ? REGION_TUNING.airportVisitors : 0);

  return {
    connections: connections.map(({ side, lanes: n, row, col }) => ({ side, lanes: n, row, col, neighbour: neighbours[side] })),
    capacity,
    out,
    into,
    utilisation: capacity > 0 ? clampShare((out + into) / capacity) : 0,
    goodsRoute: hasPort && goodsRoute === 'road' ? 'road+port' : goodsRoute,
    visitors,
    // demand effects, applied by updateDemand
    demandR: REGION_TUNING.bedroomDemand * clampShare((out / Math.max(1, labourForce)) * 4),
    demandC: REGION_TUNING.commuteInDemand * clampShare((into / Math.max(1, jobs)) * 4),
    demandI: REGION_TUNING.commuteInDemand * clampShare((into / Math.max(1, jobs)) * 4)
      - (goodsRoute === 'none' && industrialCount > 0 ? REGION_TUNING.noGoodsRoutePenalty : 0),
  };
}

function getRegionTourismCapacityBonus() {
  return Math.max(0, Number(city?.regionFlows?.visitors) || 0);
}

// Cross-district traffic on the edge roads (called from updateTrafficMap).
function addRegionTrafficLoad(addLoad) {
  const flows = city?.regionFlows;
  if (!flows?.connections?.length || !(flows.utilisation > 0)) return;
  flows.connections.forEach((connection) => {
    addLoad(connection.row, connection.col, REGION_TUNING.trafficPerLane * connection.lanes * flows.utilisation);
  });
}

// ── Signs at the edge: 「往觀塘」 ─────────────────────────────────────────────

function drawRegionConnectionSign(scene, connection) {
  const name = getRegionNeighbourName(connection.neighbour);
  const englishName = getRegionNeighbourName(connection.neighbour, 'en');
  const chinese = t('region.to', { name });
  const english = `To ${englishName}`;
  const width = Math.max(110, Math.min(240, Math.max(Array.from(chinese).length * 21, english.length * 8.5) + 34));
  const height = 58;
  const container = scene.add.container(0, 0);
  const plate = scene.add.graphics();
  plate.fillStyle(0x1d6e45, 1);
  plate.fillRoundedRect(-width / 2, -height / 2, width, height, 5);
  plate.lineStyle(3, 0xf5f4ea, 1);
  plate.strokeRoundedRect(-width / 2 + 2, -height / 2 + 2, width - 4, height - 4, 4);
  const englishLabel = scene.add.text(0, -12, english, {
    color: '#ffffff',
    fontFamily: 'Arial Narrow, Helvetica Neue, Arial, sans-serif',
    fontSize: '13px',
    fontStyle: 'bold',
    resolution: 2,
  }).setOrigin(0.5, 0.5);
  const chineseLabel = scene.add.text(0, 11, chinese, {
    color: '#ffffff',
    fontFamily: 'PingFang HK, LiHei Pro, Microsoft JhengHei, Noto Sans TC, sans-serif',
    fontSize: '19px',
    fontStyle: 'bold',
    resolution: 2,
  }).setOrigin(0.5, 0.5);
  container.add([plate, englishLabel, chineseLabel]);
  container.setMask(scene.worldMask);
  container.regionConnection = connection;
  return container;
}

function positionRegionConnectionSign(scene, sign, index = 0) {
  const { row, col } = sign.regionConnection;
  const pos = isoToScreen(col, row);
  sign.setPosition(
    pos.x + scene.offsetX,
    pos.y + scene.offsetY - TILE_HEIGHT / 2 + getElevationVisualOffset(row, col) - 50,
  );
  sign.setDepth(getPreviewOverlayDepth(60 + index));
}

function rebuildRegionConnectionSigns(scene) {
  if (!scene?.add) return;
  scene.regionConnectionSigns?.forEach((sign) => sign.destroy(true));
  scene.regionConnectionSigns = [];
  const neighbours = getRegionNeighbours();
  detectRegionConnections().forEach((connection, index) => {
    const sign = drawRegionConnectionSign(scene, { ...connection, neighbour: neighbours[connection.side] });
    positionRegionConnectionSign(scene, sign, index);
    sign.setVisible(typeof areDistrictSignsVisible === 'function' ? areDistrictSignsVisible() : true);
    scene.regionConnectionSigns.push(sign);
  });
}

function repositionRegionConnectionSigns(scene) {
  scene?.regionConnectionSigns?.forEach((sign, index) => positionRegionConnectionSign(scene, sign, index));
}

// Rebuild the signs when the edge roads, the neighbours or the language change.
function syncRegionConnectionSigns(scene = typeof activeScene !== 'undefined' ? activeScene : null) {
  if (!scene) return;
  const neighbours = getRegionNeighbours();
  const key = `${detectRegionConnections().map((c) => `${c.side}${c.row},${c.col}x${c.lanes}`).join('|')}#${REGION_SIDES.map((s) => neighbours[s]).join(',')}#${typeof currentLanguage !== 'undefined' ? currentLanguage : ''}`;
  if (key === regionSignKey && scene.regionConnectionSigns) return;
  regionSignKey = key;
  rebuildRegionConnectionSigns(scene);
}

// ── 「更多訊息」: the connections and last month's flows ──────────────────────

// ── 跨區塞車 on the forum ─────────────────────────────────────────────────────

// A month the roads out are this full (city.regionFlows.utilisation) makes the forum; then not
// again for a while. The post has no picture yet.
const REGION_JAM_UTILISATION = 0.9;
const REGION_JAM_COOLDOWN_MONTHS = 6;

// Called once a month (updateCouncilTimedSystems, council-effects.js).
function maybeAnnounceRegionCongestion(monthIndex) {
  const flows = city?.regionFlows;
  if (!flows || !(flows.utilisation >= REGION_JAM_UTILISATION) || !flows.connections?.length) return null;
  if (typeof addForumPost !== 'function') return null;
  const posts = Array.isArray(city.forumPosts) ? city.forumPosts : [];
  const recent = posts.some((post) => {
    const match = /^regionJam-(\d+)$/.exec(post?.id || '');
    return match && monthIndex - Number(match[1]) < REGION_JAM_COOLDOWN_MONTHS;
  });
  if (recent) return null;

  const cityName = String(city.name || '').trim() || '香城';
  const names = [...new Set(flows.connections.map((connection) => getRegionNeighbourName(connection.neighbour, 'zhHant')))];
  const towards = names.join('、');
  const lanes = flows.connections.reduce((sum, connection) => sum + connection.lanes, 0);
  const commuters = (flows.out + flows.into).toLocaleString();
  const outbound = flows.out >= flows.into;
  const headline = `【跨區塞車】${cityName}往${towards}對外道路大擠塞　上班族：「出入城要成個鐘」`;
  if (typeof addCityNews === 'function') addCityNews(headline);
  return addForumPost({
    headline,
    body: [
      `今朝繁忙時間，${cityName}通往${towards}嘅對外道路全線擠塞。得 ${lanes} 條行車線，每日要應付約 ${commuters} 人次跨區通勤，車龍由區界一直排返入市區。`,
      outbound
        ? `「區內搵唔到工，大家都要出去返工，條路點會唔塞？」一位喺巴士站等咗半個鐘嘅街坊話。有司機話由屋企揸到區界已經用咗成個鐘。`
        : `「外區嘅人一窩蜂入嚟返工，返工放工兩條龍。」一位區內商戶老闆話。有市民話寧願提早一個鐘出門避開車龍。`,
      `運輸署發言人表示，正研究加闊或者加開對外道路，又呼籲市民盡量轉乘公共交通。有網民留言：「起多條路啦，唔好淨係講研究。」`,
    ],
    source: 'local',
    social: { likes: 820, laughs: 140, angry: 1350, commentCount: 476, shares: 390 },
  }, { id: `regionJam-${monthIndex}`, category: '城中熱話', author: '香城交通台' });
}

function updateRegionConnectionPanel() {
  const section = document.getElementById('budget-region');
  const body = document.getElementById('budget-region-body');
  if (!section || !body) return;
  const flows = city?.regionFlows;
  section.hidden = false;
  body.innerHTML = '';
  const line = (text, className = '') => {
    const element = document.createElement('span');
    element.className = `budget-note ${className}`.trim();
    element.textContent = text;
    body.appendChild(element);
  };
  const connections = flows?.connections ?? [];
  if (!connections.length) line(t('region.none'), 'region-hint');
  connections.forEach((connection) => {
    line(`${t(`region.side.${connection.side}`)} · ${t('region.to', { name: getRegionNeighbourName(connection.neighbour) })} · ${t('region.lanes', { count: connection.lanes })}`);
  });
  if (connections.length) {
    line(`${t('region.commuteOut', { count: (flows.out ?? 0).toLocaleString() })} · ${t('region.commuteIn', { count: (flows.into ?? 0).toLocaleString() })} · ${t('region.usage', { pct: Math.round((flows.utilisation ?? 0) * 100) })}`);
  }
  if (flows?.visitors > 0) line(t('region.visitors', { pct: Math.round(flows.visitors * 100) }));
  line(t(`region.goods.${flows?.goodsRoute === 'road+port' ? 'road' : flows?.goodsRoute ?? 'none'}`), flows?.goodsRoute === 'none' ? 'region-warning' : '');
}

if (typeof document !== 'undefined') {
  document.addEventListener('languagechange', () => {
    updateRegionConnectionPanel();
    syncRegionConnectionSigns();
  });
}
