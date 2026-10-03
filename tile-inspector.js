// Tile inspector: the building record, indicator and custom-name lookups inspect-panel.js
// reads, and the legacy hover tooltip it replaced (showTileDebug, kept but disabled).
// Split out of main.js.

// ── Tile debug tooltip ────────────────────────────────────────────────────────

function showTileDebug(scene, pointer) {
  const el = document.getElementById('tile-debug');
  if (!el) return;

  // The inspect tool is click-to-show only. Keep this legacy hover tooltip
  // disabled so the persistent inspect panel is the single source of truth.
  el.style.display = 'none';
  return;

  // Tile info tooltip is only active in ? (inspect) mode
  if (selectedTool !== 'inspect') { el.style.display = 'none'; return; }

  const tile = pointerToTile(scene, pointer);
  if (!tile) { el.style.display = 'none'; return; }

  const { row, col } = tile;
  const id      = getTileId(row, col);
  const terrain = mapData[row][col];
  const zone    = zoneMap[row]?.[col] ?? ZONE_NONE;
  const powered = !!powerMap[row]?.[col];
  const hasPowerLine = powerLineSet.has(id);
  const hasRoad = hasAdjacentRoad(row, col);
  const hasBldg = scene.buildingSprites.has(id);

  // ── Building-data lookup with two fallbacks ──────────────────────────────
  // 1. Exact tile (fast path)
  let bData = buildingData[id];

  // 2. Multi-tile anchor fallback: buildingData is stored at the anchor tile
  //    (sprite.mapRow / sprite.mapCol) but the sprite is registered at every
  //    footprint cell — so look up the anchor when the hovered cell is a
  //    non-anchor footprint cell.
  if (!bData && hasBldg) {
    const s = scene.buildingSprites.get(id);
    if (s) bData = buildingData[getTileId(s.mapRow, s.mapCol)];
  }

  // 3. Proximity fallback — ANY building type:
  //    Tall sprites (power plants, high-rises, fire stations…) extend 3–5 tile-heights
  //    above their logical 1×1 footprint.  When hovering over the upper body,
  //    pointerToTile returns a tile N-W of the actual base — up to ~5 Manhattan steps
  //    away for the tallest buildings.
  //    Two search paths:
  //      A) via buildingSprites (every footprint tile → sprite anchor → buildingData)
  //      B) direct buildingData lookup (catches anchors even if sprite registration differs)
  if (!bData) {
    let bestDist = Infinity, bestBd = null;
    // Buildings extend NW visually; footprint is likely SE of the cursor.
    // Scan −2..+7 to cover both directions plus rotation variants.
    for (let dr = -2; dr <= 7; dr++) {
      for (let dc = -2; dc <= 7; dc++) {
        if (!isInsideMap(row + dr, col + dc)) continue;
        const nid  = getTileId(row + dr, col + dc);
        const dist = Math.abs(dr) + Math.abs(dc);
        if (dist >= bestDist) continue;   // prune — no point reading further

        // Path A: via buildingSprites → anchor → buildingData
        const spr = scene.buildingSprites.get(nid);
        if (spr) {
          const bd = buildingData[getTileId(spr.mapRow, spr.mapCol)];
          if (bd) { bestDist = dist; bestBd = bd; continue; }
        }
        // Path B: direct buildingData at this tile (anchor tile only)
        const bd = buildingData[nid];
        if (bd) { bestDist = dist; bestBd = bd; }
      }
    }
    // Accept any building within 6 Manhattan steps — covers the tallest sprites
    if (bestBd && bestDist <= 6) bData = bestBd;
  }

  const TERRAIN_NAMES = ['?', 'Ground', 'Road', 'Dirt', 'Beach', 'Water', 'Hill'];
  const ZONE_NAMES    = { [ZONE_NONE]: null, [ZONE_RES]: 'Residential', [ZONE_COM]: 'Commercial', [ZONE_IND]: 'Industrial' };
  const ZONE_COLORS   = { [ZONE_RES]: '#66ff88', [ZONE_COM]: '#6699ff', [ZONE_IND]: '#ffcc33' };

  const density = zoneDensityMap[row]?.[col] ?? 1;

  const DENSITY_NAMES = { 1: 'Low Density', 2: 'Med Density', 3: 'High Density' };
  const DENSITY_SHORT = { 1: 'R1', 2: 'R2', 3: 'R3' };
  const zoneShort = zone === ZONE_RES ? 'R' : zone === ZONE_COM ? 'C' : 'I';

  const demand = zone === ZONE_RES ? city.demandR
               : zone === ZONE_COM ? city.demandC
               : zone === ZONE_IND ? city.demandI : 0;

  const powerMul   = powered ? 1.0 : 0.2;
  const growChance = (!hasBldg && hasRoad && demand > 0)
    ? (demand * 0.4 * powerMul * (DENSITY_GROW_MUL[density] ?? 1) * 100).toFixed(1) + '%'
    : '0%';
  const canGrow = !hasBldg && hasRoad && demand > 0;

  // Check why it can't grow
  const blockers = [];
  if (zone === ZONE_NONE) blockers.push('no zone');
  if (zone !== ZONE_NONE && hasBldg) blockers.push('already has building');
  if (zone !== ZONE_NONE && !hasRoad) blockers.push('no road within 1 tile');
  if (zone !== ZONE_NONE && demand <= 0) blockers.push(`demand ≤ 0 (${demand.toFixed(2)})`);

  const zoneColor = ZONE_COLORS[zone] ?? '#aaa';
  const zoneName  = ZONE_NAMES[zone] ?? 'None';

  // ── Building identity helpers ────────────────────────────────────────────────
  const BLDG_TYPE_LABEL = {
    residential:       'Residential Building',
    commercial:        'Commercial Building',
    industrial:        'Industrial Building',
    power_plant_coal:  'Coal Power Plant',
    power_plant_solar: 'Solar Power Plant',
    fire_station:      'Fire Station',
    police_station:    'Police Station',
    primary_school:    'Primary School',
    secondary_school:  'Secondary School',
    library:           'Library',
    community_college: 'Community College',
    university:        'University',
    hospital:          'Hospital',
    park_small:         'Small Park',
    park_large:         'Large Park',
  };
  const BLDG_SUB_LABEL = {
    residential: {
      L: 'Public Estate (L)', M: 'Private Residence (M)', H: 'Wealthy Residence (H)', UH: 'Mansion (UH)',
    },
    commercial:  { 1: 'Shop',     2: 'Commercial Block',  3: 'Office Tower' },
    industrial:  { 1: 'Factory',  2: 'Industrial Complex',3: 'Heavy Industry'},
  };
  const getBldgSubLabelKey = (record) => (record?.type === 'residential' ? (record.wealthTier ?? 'L') : (record?.level ?? 1));

  // Sprite texture key — prefer bData.spriteKey (set at placement time);
  // fall back to reading it from the sprite currently at this tile.
  const bSprite   = scene.buildingSprites.get(id);
  const spriteKey = bData?.spriteKey
                 ?? bSprite?.texture?.key
                 ?? null;

  // Build a human-readable label for the title line.
  // Use bData (found by ANY fallback, including proximity) — not just hasBldg.
  let titleLabel;
  if (bData) {
    const typeLabel = BLDG_TYPE_LABEL[bData.type] ?? bData.type;
    const subLabel  = BLDG_SUB_LABEL[bData.type]?.[getBldgSubLabelKey(bData)];
    titleLabel      = subLabel ? `${typeLabel} · ${subLabel}` : typeLabel;
  } else if (hasBldg) {
    titleLabel = 'Building';
  } else {
    titleLabel = TERRAIN_NAMES[terrain] ?? '?';
  }

  let html = `
    <div class="dbg-title">[${row}, ${col}] — ${titleLabel}</div>
    ${spriteKey && (hasBldg || bData) ? `<div class="dbg-sprite-key">${spriteKey}</div>` : ''}
    <div class="dbg-divider"></div>`;

  // ── Infrastructure building tooltip ──────────────────────────────────────────
  const INFRA_TYPES = ['power_plant_coal', 'power_plant_solar', 'power_plant_nuclear', 'fire_station', 'police_station', 'primary_school', 'secondary_school', 'library', 'community_college', 'university', 'hospital', 'legislative_council', 'stock_exchange', 'park_small', 'park_large', 'sports_ground_small', 'sports_ground_large'];
  if (bData && INFRA_TYPES.includes(bData.type)) {
    const INFRA_LABELS = {
      power_plant_coal:    '⚡ Coal Power Plant',
      power_plant_solar:   '☀️ Solar Power Plant',
      power_plant_nuclear: '☢️ Nuclear Power Plant',
      fire_station:        '🚒 Fire Station',
      police_station:      '👮 Police Station',
      primary_school:      '🏫 Primary School',
      secondary_school:    '🏫 Secondary School',
      library:             '📚 Library',
      community_college:   '🎓 Community College',
      university:          '🎓 University',
      hospital:            '🏥 Hospital',
      park_small:          '🌳 Small Park',
      park_large:          '🌲 Large Park',
      sports_ground_small: '⚽ Sports Ground',
      sports_ground_large: '🏟 Sports Complex',
    };
    const INFRA_DESCS = {
      power_plant_coal:    `Grid power source · Upkeep $${UPKEEP_COAL_PLANT}/mo · Polluting`,
      power_plant_solar:   `Grid power source · Upkeep $${UPKEEP_SOLAR_PLANT}/mo · Clean`,
      power_plant_nuclear: `Grid power source · Upkeep $${UPKEEP_NUCLEAR_PLANT}/mo · Near-zero emissions · High NIMBY`,
      fire_station:        `Fire coverage radius ${FIRE_STATION_RADIUS} tiles · Upkeep $${UPKEEP_FIRE_STATION}/mo`,
      police_station:      `Crime reduction radius ${POLICE_STATION_RADIUS} tiles · Upkeep $${UPKEEP_POLICE_STATION}/mo`,
      primary_school:      `Basic education radius ${PRIMARY_SCHOOL_RADIUS} tiles · Upkeep $${UPKEEP_PRIMARY_SCHOOL}/mo`,
      secondary_school:    `Basic education radius ${SECONDARY_SCHOOL_RADIUS} tiles · Upkeep $${UPKEEP_SECONDARY_SCHOOL}/mo`,
      library:             `Basic education radius ${LIBRARY_RADIUS} tiles · Upkeep $${UPKEEP_LIBRARY}/mo`,
      community_college:   `Higher education radius ${COMMUNITY_COLLEGE_RADIUS} tiles · Upkeep $${UPKEEP_COMMUNITY_COLLEGE}/mo`,
      university:          `Higher education radius ${UNIVERSITY_RADIUS} tiles · Upkeep $${UPKEEP_UNIVERSITY}/mo`,
      hospital:            `Health coverage radius ${HOSPITAL_RADIUS} tiles · Upkeep $${UPKEEP_HOSPITAL}/mo`,
      park_small:          `Residential happiness radius ${SMALL_PARK_RADIUS} tiles · Upkeep $${UPKEEP_PARK_SMALL}/mo`,
      park_large:          `Residential happiness radius ${LARGE_PARK_RADIUS} tiles · Upkeep $${UPKEEP_PARK_LARGE}/mo`,
      sports_ground_small: `Recreation radius ${SPORTS_GROUND_RADIUS} tiles · Upkeep $${UPKEEP_SPORTS_GROUND_SMALL}/mo`,
      sports_ground_large: `Recreation radius ${SPORTS_GROUND_RADIUS} tiles · Upkeep $${UPKEEP_SPORTS_GROUND_LARGE}/mo`,
    };
    const INFRA_COLORS = {
      power_plant_coal:    '#ffcc44', power_plant_solar:   '#ffe066', power_plant_nuclear: '#66ffcc',
      fire_station:        '#ff7755', police_station:      '#6699ff',
      primary_school:      '#59a9ff', secondary_school:    '#2f78cc',
      library:             '#6f9cd6', community_college:   '#7a77cc',
      university:          '#5f52b4', hospital:            '#35b98f',
      park_small:          '#58d66a', park_large:          '#32b457',
      sports_ground_small: '#f0a830', sports_ground_large: '#e07b20',
    };
    html += `
      <div style="color:${INFRA_COLORS[bData.type]};font-weight:bold">${INFRA_LABELS[bData.type]}</div>
      <div class="dbg-muted">${INFRA_DESCS[bData.type]}</div>
      <div class="${powered ? 'dbg-ok' : 'dbg-warn'}">Powered : ${powered ? '✓ yes' : '✗ no — needs power source'}</div>
      <div class="dbg-muted">Age : ${POWER_PLANT_STATS[bData.type] ? formatPowerPlantAge(bData) : `${bData.age ?? 0} ticks in service`}</div>`;
    if (bData.type === 'power_plant_coal' || bData.type === 'power_plant_solar' || bData.type === 'power_plant_nuclear') {
      const generation = getPowerPlantGenerationSummary(bData);
      const load = getPowerPlantLoadSummary(bData);
      html += `
        <div class="dbg-muted">Generation : ${generation.output} MW / ${generation.maxOutput} MW</div>
        <div class="dbg-muted">Load : ${load.load} MW / ${load.maxLoad} MW (${Math.round(load.loadRatio * 100)}%)</div>
        <div class="dbg-muted">Maintenance : $${getPowerPlantMaintenance(bData)}/mo</div>
        <div class="dbg-muted">Remaining life : ${getPowerPlantRemainingMonths(bData)} months</div>
        <div class="dbg-muted">Total power sources : ${powerSources.size}</div>`;
    }
    html += `<div class="dbg-divider"></div>`;
  }

  if (zone !== ZONE_NONE) {
    html += `
      <div style="color:${zoneColor}">Zone: ${zoneName} — ${DENSITY_NAMES[density]} (${zoneShort}${density})</div>
      <div class="${hasRoad   ? 'dbg-ok'   : 'dbg-fail'}">Road adjacent : ${hasRoad   ? '✓ yes' : '✗ no  ← zone needs road'}</div>
      <div class="${powered   ? 'dbg-ok'   : 'dbg-warn'}">Powered       : ${powered   ? '✓ yes (100% speed)' : `✗ no  (${powerSources.size === 0 ? 'no plant!' : '20% speed'})`}</div>
      <div class="${demand > 0 ? 'dbg-ok'  : 'dbg-fail'}">Demand        : ${demand >= 0 ? '+' : ''}${demand.toFixed(3)}</div>
      <div class="${hasBldg   ? 'dbg-warn' : 'dbg-muted'}">Has building  : ${hasBldg  ? `✓ ${bData ? `(${BLDG_TYPE_LABEL[bData.type] ?? bData.type}${BLDG_SUB_LABEL[bData.type]?.[getBldgSubLabelKey(bData)] ? ' · ' + BLDG_SUB_LABEL[bData.type][getBldgSubLabelKey(bData)] : ''} lv${bData.level ?? 1})` : '(manual)'}` : '— (empty)'}</div>
      <div class="dbg-divider"></div>`;

    if (canGrow) {
      html += `<div class="dbg-grow-yes">✓ CAN GROW — ${growChance}/tick</div>`;
      if (!powered) html += `<div class="dbg-warn">  → Add power plant to grow 5× faster</div>`;
    } else {
      html += `<div class="dbg-grow-no">✗ CANNOT GROW</div>`;
      blockers.forEach((b) => { html += `<div class="dbg-fail">  → ${b}</div>`; });
    }
  } else {
    html += `<div class="dbg-muted">No zone — use R/C/I tools to zone this tile</div>`;
    if (hasPowerLine) html += `<div class="dbg-warn">Has power line ⚡</div>`;
  }

  // Global city stats summary
  html += `
    <div class="dbg-divider"></div>
    <div class="dbg-muted">Power sources: ${powerSources.size} | Power lines: ${powerLineSet.size}</div>
    <div class="dbg-muted">demandR=${city.demandR.toFixed(2)} C=${city.demandC.toFixed(2)} I=${city.demandI.toFixed(2)}</div>`;

  if (typeof activeOverlay === 'string' && activeOverlay) {
    const val = getTileOverlayValue(activeOverlay, row, col);
    const overlayLabel = { pollution: '🏭 Pollution', crime: '🚔 Crime', fire: '🔥 Fire Risk', population: '👥 Population', landvalue: '💰 Land Value', education: '🎓 Education', health: '🏥 Health', electricity: '🔌 Electricity', power: '⚡ Power Plants' };
    html += `<div class="dbg-muted">${overlayLabel[activeOverlay] ?? activeOverlay}: ${(val * 100).toFixed(0)}%</div>`;
  }

  el.innerHTML = html;
  el.style.display = 'block';

  // Position tooltip near cursor, avoid right/bottom overflow
  const pad = 16;
  const tw  = el.offsetWidth  || 220;
  const th  = el.offsetHeight || 160;
  const cx  = pointer.event?.clientX ?? pointer.x;
  const cy  = pointer.event?.clientY ?? pointer.y;
  const vw  = window.innerWidth;
  const vh  = window.innerHeight;

  el.style.left = (cx + pad + tw > vw ? cx - tw - pad : cx + pad) + 'px';
  el.style.top  = (cy + pad + th > vh ? cy - th - pad : cy + pad) + 'px';
}

function hideTileDebug() {
  const el = document.getElementById('tile-debug');
  if (el) el.style.display = 'none';
}

function resolveBuildingRecordForInspect(scene, row, col) {
  const id = getTileId(row, col);
  const hasBldg = scene.buildingSprites.has(id);

  let bData = buildingData[id];
  let anchorRow = row;
  let anchorCol = col;

  if (!bData && hasBldg) {
    const sprite = scene.buildingSprites.get(id);
    if (sprite) {
      anchorRow = sprite.mapRow;
      anchorCol = sprite.mapCol;
      bData = buildingData[getTileId(anchorRow, anchorCol)] ?? null;
    }
  }

  return {
    bData,
    hasBldg,
    anchorRow,
    anchorCol,
    anchorId: bData ? getTileId(anchorRow, anchorCol) : null,
  };
}

function clampUnit(value) {
  return Math.max(0, Math.min(1, value));
}

function getInspectIndicators(row, col) {
  const landValue = getTileOverlayValue('landvalue', row, col);
  const pollution = getTileOverlayValue('pollution', row, col);
  const svc = serviceMap[row]?.[col];
  const powered = !!powerMap[row]?.[col];
  const parkLevel = Math.min(2, svc?.park ?? 0);

  const localBase = 0.24
    + (powered ? 0.18 : 0)
    + (svc?.fire ? 0.12 : 0)
    + (svc?.police ? 0.12 : 0)
    + parkLevel * 0.06
    + landValue * 0.26
    - pollution * 0.22;

  const cityBase = city.happiness ?? 0.5;
  const happiness = clampUnit(localBase * 0.65 + cityBase * 0.35);

  return { landValue, happiness };
}

function getBuildingCustomName(record) {
  if (!record || typeof record.customName !== 'string') return '';
  return record.customName.trim();
}
