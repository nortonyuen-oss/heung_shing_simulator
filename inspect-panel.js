function renameInspectedBuilding() {
  if (!activeScene || !lastInspectTile) return;

  const info = resolveBuildingRecordForInspect(activeScene, lastInspectTile.row, lastInspectTile.col);
  if (!info.bData || !info.anchorId || !buildingData[info.anchorId]) {
    showToast(t('toast.noBuildingToName'), 'warning');
    return;
  }

  const currentName = getBuildingCustomName(buildingData[info.anchorId]);
  const next = window.prompt(t('prompt.buildingName'), currentName);
  if (next === null) return;

  const trimmed = next.trim().slice(0, 30);
  if (trimmed) {
    buildingData[info.anchorId].customName = trimmed;
    showToast(t('toast.buildingNamed', { name: trimmed }), 'info');
  } else {
    delete buildingData[info.anchorId].customName;
    showToast(t('toast.buildingNameCleared'), 'info');
  }

  showInspectPanel(activeScene, lastInspectTile.row, lastInspectTile.col);
}

// ── Inspect panel (click-to-inspect mode) ────────────────────────────────────

function showInspectPanel(scene, row, col, pointer = null) {
  lastInspectTile = { row, col };
  const panel   = document.getElementById('inspect-panel');
  const content = document.getElementById('inspect-content');
  if (!panel || !content) return;

  const id      = getTileId(row, col);
  const terrain = mapData[row][col];
  const tileHeight = getTileHeight(row, col);
  const zone    = zoneMap[row]?.[col] ?? ZONE_NONE;
  const powered = !!powerMap[row]?.[col];
  const svc     = serviceMap[row]?.[col];
  const tree    = treeMap[row]?.[col];

  const inspectRecord = resolveBuildingRecordForInspect(scene, row, col);
  const hasBldg = inspectRecord.hasBldg;
  const bData = inspectRecord.bData;

  const ZONE_COLORS   = { [ZONE_RES]:'#66ff88', [ZONE_COM]:'#6699ff', [ZONE_IND]:'#ffcc33' };
  const INFRA_LABELS  = {
    power_plant_coal: `⚡ ${t('building.coalPlant')}`,
    power_plant_solar: `☀️ ${t('building.solarPlant')}`,
    fire_station: `🚒 ${t('building.fireStation')}`,
    police_station: `👮 ${t('building.policeStation')}`,
    primary_school: `🏫 ${t('building.primarySchool')}`,
    secondary_school: `🏫 ${t('building.secondarySchool')}`,
    library: `📚 ${t('building.library')}`,
    community_college: `🎓 ${t('building.communityCollege')}`,
    university: `🎓 ${t('building.university')}`,
    legislative_council: `🏛️ ${t('building.legislativeCouncil')}`,
    stock_exchange: `🏦 ${t('building.stockExchange')}`,
    park_small: `🌳 ${t('building.smallPark')}`,
    park_large: `🌲 ${t('building.largePark')}`,
  };
  const INFRA_DESCS   = {
    power_plant_coal: t('inspect.gridPowerSource', { upkeep: UPKEEP_COAL_PLANT, quality: t('inspect.polluting') }),
    power_plant_solar: t('inspect.gridPowerSource', { upkeep: UPKEEP_SOLAR_PLANT, quality: t('inspect.clean') }),
    fire_station: t('inspect.coverageRadius', { radius: FIRE_STATION_RADIUS, upkeep: UPKEEP_FIRE_STATION }),
    police_station: t('inspect.coverageRadius', { radius: POLICE_STATION_RADIUS, upkeep: UPKEEP_POLICE_STATION }),
    primary_school: t('inspect.educationRadiusBasic', { radius: PRIMARY_SCHOOL_RADIUS, upkeep: UPKEEP_PRIMARY_SCHOOL }),
    secondary_school: t('inspect.educationRadiusBasic', { radius: SECONDARY_SCHOOL_RADIUS, upkeep: UPKEEP_SECONDARY_SCHOOL }),
    library: t('inspect.educationRadiusBasic', { radius: LIBRARY_RADIUS, upkeep: UPKEEP_LIBRARY }),
    community_college: t('inspect.educationRadiusHigher', { radius: COMMUNITY_COLLEGE_RADIUS, upkeep: UPKEEP_COMMUNITY_COLLEGE }),
    university: t('inspect.educationRadiusHigher', { radius: UNIVERSITY_RADIUS, upkeep: UPKEEP_UNIVERSITY }),
    legislative_council: t('inspect.legislativeCouncil'),
    stock_exchange: t('inspect.stockExchange'),
    park_small: t('inspect.parkRadius', { radius: SMALL_PARK_RADIUS, upkeep: UPKEEP_PARK_SMALL }),
    park_large: t('inspect.parkRadius', { radius: LARGE_PARK_RADIUS, upkeep: UPKEEP_PARK_LARGE }),
  };
  const INFRA_COLORS  = {
    power_plant_coal:'#ffcc44',
    power_plant_solar:'#ffe066',
    fire_station:'#ff7755',
    police_station:'#6699ff',
    primary_school:'#59a9ff',
    secondary_school:'#2f78cc',
    library:'#6f9cd6',
    community_college:'#7a77cc',
    university:'#5f52b4',
    legislative_council:'#4d6bbf',
    stock_exchange:'#c39a2d',
    park_small:'#58d66a',
    park_large:'#32b457',
  };
  const INFRA_TYPES   = Object.keys(INFRA_LABELS);

  // Build the coord line: prefer building name over raw terrain name
  const bSpriteInsp  = scene.buildingSprites.get(id);
  const spriteKeyInsp = bData?.spriteKey ?? bSpriteInsp?.texture?.key ?? null;
  let coordTitle;
  if (bData) {
    const customName = getBuildingCustomName(bData);
    if (customName) {
      coordTitle = customName;
    } else {
      const tl = getBuildingTypeLabel(bData.type);
      const sl = getBuildingSubLabel(bData.type, bData.level ?? 1);
      coordTitle = sl ? `${tl} · ${sl}` : tl;
    }
  } else if (hasBldg) {
    coordTitle = t('building.generic');
  } else if (tree) {
    coordTitle = (tree.age ?? 0) >= TREE_MATURE_AGE ? 'Mature Tree' : 'Young Tree';
  } else {
    coordTitle = getTerrainName(terrain);
  }

  const indicators = getInspectIndicators(row, col);
  const landValuePct = `${Math.round(indicators.landValue * 100)}%`;
  const happinessPct = `${Math.round(indicators.happiness * 100)}%`;

  let html = `
    <div class="insp-coord">[${row}, ${col}] — ${coordTitle}</div>
    ${spriteKeyInsp && (hasBldg || bData) ? `<div class="insp-sprite-key">${spriteKeyInsp}</div>` : ''}
    <div class="insp-row insp-muted">Terrain height: L${tileHeight} (${tileHeight * 100}m)</div>
    <div class="insp-row">${t('inspect.landValue', { value: landValuePct })}</div>
    <div class="insp-row">${t('inspect.happiness', { value: happinessPct })}</div>`;

  if (tree && !bData) {
    html += `<div class="insp-row insp-ok">Tree age: ${tree.age ?? 0}/${TREE_MATURE_AGE} · ${tree.species}</div>`;
  }

  if (bData) {
    html += `
      <div class="insp-section">
        <button class="insp-action-btn" type="button" onclick="renameInspectedBuilding()">${t('inspect.renameBuilding')}</button>
        ${bData.type === 'legislative_council' ? `<button class="insp-action-btn" type="button" onclick="openLegislativeWindow()">${t('building.legislativeCouncil')}</button>` : ''}
        ${bData.type === 'stock_exchange' ? `<button class="insp-action-btn" type="button" onclick="openStockExchangeWindow()">${t('building.stockExchange')}</button>` : ''}
      </div>`;
  }

  // Infrastructure building
  if (bData && INFRA_TYPES.includes(bData.type)) {
    const isPark = bData.type === 'park_small' || bData.type === 'park_large';
    html += `
      <div class="insp-section">
        <div class="insp-bldg-name" style="color:${INFRA_COLORS[bData.type]}">${INFRA_LABELS[bData.type]}</div>
        <div class="insp-row">${INFRA_DESCS[bData.type]}</div>
        ${isPark
          ? `<div class="insp-row insp-ok">${t('inspect.nearbyResidentialBoost')}</div>`
          : `<div class="insp-row ${powered ? 'insp-ok' : 'insp-warn'}">${t('inspect.power', { status: powered ? t('inspect.powerActive') : t('inspect.powerUnpowered') })}</div>`}
        <div class="insp-row insp-muted">${POWER_PLANT_STATS[bData.type] ? t('inspect.powerAge', { age: formatPowerPlantAge(bData) }) : t('inspect.age', { age: bData.age ?? 0 })}</div>
      </div>`;
    if (bData.type === 'power_plant_coal' || bData.type === 'power_plant_solar') {
      const generation = getPowerPlantGenerationSummary(bData);
      const load = getPowerPlantLoadSummary(bData);
      const powerState = getPowerPlantState(bData);
      html += `
        <div class="insp-section">
          <div class="insp-row insp-ok">${t('inspect.powerGeneration', { output: generation.output, maxOutput: generation.maxOutput })}</div>
          <div class="insp-row ${load.status === 'overloaded' ? 'insp-warn' : 'insp-ok'}">${t('inspect.powerLoad', { load: load.load, maxLoad: load.maxLoad })}</div>
          <div class="insp-row insp-muted">${t('inspect.powerState', { state: t(`inspect.powerState${powerState.charAt(0).toUpperCase()}${powerState.slice(1)}`) })}</div>
          <div class="insp-row insp-muted">${t('inspect.powerRemaining', { remaining: getPowerPlantRemainingMonths(bData) })}</div>
          ${bData.powerWarning ? `<div class="insp-row insp-warn">${t('inspect.powerWarning')}</div>` : ''}
          <div class="insp-row insp-muted">$${getPowerPlantMaintenance(bData)}/mo upkeep</div>
        </div>`;
    }
  }

  // Zone / residential building
  if (zone !== ZONE_NONE) {
    const density  = zoneDensityMap[row]?.[col] ?? 1;
    const demand   = zone === ZONE_RES ? city.demandR : zone === ZONE_COM ? city.demandC : city.demandI;
    const zColor   = ZONE_COLORS[zone] ?? '#aaa';
    const hasRoad  = hasAdjacentRoad(row, col);

    const BLDG_DISPLAY = {
      residential: { 1: t('building.smallHouse'), 2: t('building.apartmentBlock'), 3: t('building.highRiseResidential') },
      commercial:  { 1: t('building.smallShop'), 2: t('building.commercialBlockIcon'), 3: t('building.officeTowerIcon') },
      industrial:  { 1: t('building.smallFactory'), 2: t('building.industrialComplexIcon'), 3: t('building.heavyIndustryIcon') },
    };
    const BLDG_POP_LABEL = { residential: t('inspect.residents'), commercial: t('inspect.workers'), industrial: t('inspect.workers') };

    let bldgHtml = '';
    if (bData && BLDG_DISPLAY[bData.type]) {
      const lvl      = bData.level ?? 1;
      const dispName = BLDG_DISPLAY[bData.type][lvl] ?? `${getBuildingTypeLabel(bData.type)} ${lvl}`;
      const popLabel = BLDG_POP_LABEL[bData.type] ?? t('inspect.residents');
      const avgEducation = typeof getAverageEducationForBuilding === 'function'
        ? getAverageEducationForBuilding(bData, inspectRecord.anchorRow, inspectRecord.anchorCol)
        : 0;
      const avgEducationPct = `${Math.round(clampUnit(avgEducation) * 100)}%`;
      const occupancy = bData.type === 'residential'
        ? (bData.population ?? 0)
        : getBuildingJobCapacity(bData);
      bldgHtml = `
        <div class="insp-bldg-name" style="color:${zColor}">${dispName}</div>
        <div class="insp-row insp-muted">${t('inspect.levelPopulation', { level: lvl, population: occupancy.toLocaleString(), label: popLabel })}</div>
        <div class="insp-row insp-muted">${t('inspect.avgEducation', { value: avgEducationPct })}</div>`;
    } else {
      bldgHtml = `<div class="insp-row insp-muted">${t('inspect.emptyLot')}</div>`;
    }

    html += `
      <div class="insp-section">
        <div class="insp-zone-name" style="color:${zColor}">${getZoneName(zone)} · ${getDensityLabel(density)}</div>
        ${bldgHtml}
        <div class="insp-divider"></div>
        <div class="insp-row ${hasRoad  ? 'insp-ok' : 'insp-fail'}">${t('inspect.roadAccess', { status: hasRoad ? '✓' : t('inspect.needed') })}</div>
        <div class="insp-row ${powered  ? 'insp-ok' : 'insp-warn'}">${t('inspect.power', { status: powered ? '✓' : t('inspect.powerGrowth') })}</div>
        <div class="insp-row">${t('inspect.demand', { demand: `${demand >= 0 ? '+' : ''}${demand.toFixed(2)}` })}</div>
      </div>`;
  }

  // Service coverage
  if (svc || zone !== ZONE_NONE) {
    html += `
      <div class="insp-section">
        <div class="insp-row ${svc?.fire   ? 'insp-ok' : 'insp-muted'}">🚒 ${svc?.fire   ? t('inspect.fireProtected')  : t('inspect.noFireCover')}</div>
        <div class="insp-row ${svc?.police ? 'insp-ok' : 'insp-muted'}">👮 ${svc?.police ? t('inspect.policeCoverage') : t('inspect.noPoliceCover')}</div>
        <div class="insp-row ${svc?.park   ? 'insp-ok' : 'insp-muted'}">🌳 ${svc?.park === 2 ? t('inspect.largeParkNearby') : svc?.park === 1 ? t('inspect.smallParkNearby') : t('inspect.noParkNearby')}</div>
      </div>`;
  }

  // Power line
  if (powerLineSet.has(id)) html += `<div class="insp-row insp-warn" style="margin-top:4px">${t('inspect.powerLineOnTile')}</div>`;

  content.innerHTML = html;
  panel.style.display = 'block';
  positionInspectPanel(panel, pointer);
}

function refreshInspectPanelLanguage() {
  const panel = document.getElementById('inspect-panel');
  if (!panel || panel.style.display === 'none' || !activeScene || !lastInspectTile) return;
  showInspectPanel(activeScene, lastInspectTile.row, lastInspectTile.col);
}

function positionInspectPanel(panel, pointer) {
  if (!pointer) {
    panel.style.left = '';
    panel.style.top = '';
    panel.style.transform = '';
    return;
  }

  const pad = 14;
  const margin = 8;
  const clientX = pointer.event?.clientX ?? pointer.x;
  const clientY = pointer.event?.clientY ?? pointer.y;

  panel.style.transform = 'none';

  const width = panel.offsetWidth || 230;
  const height = panel.offsetHeight || 180;
  let left = clientX + pad;
  let top = clientY + pad;

  if (left + width + margin > window.innerWidth) {
    left = clientX - width - pad;
  }
  if (top + height + margin > window.innerHeight) {
    top = clientY - height - pad;
  }

  panel.style.left = `${Math.max(margin, left)}px`;
  panel.style.top = `${Math.max(margin, top)}px`;
}

// ── Park textures ─────────────────────────────────────────────────────────────
