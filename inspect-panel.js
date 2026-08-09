async function renameInspectedBuilding() {
  if (!activeScene || !lastInspectTile) return;

  const info = resolveBuildingRecordForInspect(activeScene, lastInspectTile.row, lastInspectTile.col);
  if (!info.bData || !info.anchorId || !buildingData[info.anchorId]) {
    showToast(t('toast.noBuildingToName'), 'warning');
    return;
  }

  const currentName = getBuildingCustomName(buildingData[info.anchorId]);
  // window.prompt() is not implemented by Electron/Chromium (unlike
  // alert/confirm) - it returns null immediately with no dialog shown at
  // all, silently no-opping this whole feature. showTextPromptDialog is the
  // app's own in-page modal (already used for "Save As"), which actually works.
  const next = await showTextPromptDialog(t('prompt.buildingName'), currentName);
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

// ── Zone growth eligibility breakdown ────────────────────────────────────────
// Commercial wealth tier (L/M/H/UH) is still gated by a per-tile minimums
// checklist (quality/land value/scenic/environment/economy, plus stock-
// exchange/airport proximity for UH) that was never surfaced anywhere in the
// UI, so a tile could look "maxed out" on the visible top-of-panel stats
// while silently failing an invisible one. This renders every factor that
// feeds COMMERCIAL_H_MINIMUMS/COMMERCIAL_UH_MINIMUMS side by side with both
// tiers' thresholds. Residential no longer has an equivalent checklist - its
// wealth tier comes entirely from the wealth district the tile sits in (see
// sim-wealth-districts.js) - so it gets a district readout instead.
const ZONE_ELIGIBILITY_FACTOR_LABEL_KEYS = {
  quality: 'inspect.factorQuality',
  landValue: 'inspect.factorLandValue',
  scenic: 'inspect.factorScenic',
  environment: 'inspect.factorEnvironment',
  health: 'inspect.factorHealth',
  economy: 'inspect.factorEconomy',
  pollution: 'inspect.factorPollution',
  stockExchange: 'inspect.factorStockExchange',
  airport: 'inspect.factorAirport',
};

const WEALTH_DISTRICT_NAME_KEYS = {
  commoner: 'inspect.wealthDistrictCommoner',
  middleClass: 'inspect.wealthDistrictMiddleClass',
  wealthy: 'inspect.wealthDistrictWealthy',
  ultraRich: 'inspect.wealthDistrictUltraRich',
};

function getZoneEligibilityFactorThreshold(minimums, factorKey) {
  if (!minimums) return null;
  if (factorKey === 'pollution') {
    return Number.isFinite(minimums.maxPollution) ? { value: minimums.maxPollution, isMax: true } : null;
  }
  return Number.isFinite(minimums[factorKey]) ? { value: minimums[factorKey], isMax: false } : null;
}

function renderZoneEligibilityMark(threshold, actualValue) {
  if (!threshold) return '<span class="insp-muted">—</span>';
  const pass = threshold.isMax ? actualValue <= threshold.value : actualValue >= threshold.value;
  return `<span class="${pass ? 'insp-ok' : 'insp-fail'}">${pass ? '✓' : '✗'}</span>`;
}

function zonePassesMinimums(factors, minimums) {
  if (!minimums) return true;
  return Object.entries(minimums).every(([key, threshold]) => (
    key === 'maxPollution' ? (factors.pollution ?? 1) <= threshold : (factors[key] ?? 0) >= threshold
  ));
}

// Residential: which wealth district this tile is in, and that district's
// fixed L/M/H/UH odds (see RESIDENTIAL_WEALTH_DISTRICT_PROBABILITIES).
function buildResidentialWealthDistrictHtml(row, col) {
  const context = typeof createResidentialQualityContext === 'function' ? createResidentialQualityContext() : null;
  const factors = getResidentialSiteFactors(row, col, 1, context);
  const tierKey = factors.wealthDistrictTier ?? 'commoner';
  const districtName = t(WEALTH_DISTRICT_NAME_KEYS[tierKey] ?? WEALTH_DISTRICT_NAME_KEYS.commoner);
  const probabilities = RESIDENTIAL_WEALTH_DISTRICT_PROBABILITIES[tierKey]
    ?? RESIDENTIAL_WEALTH_DISTRICT_PROBABILITIES.commoner;
  const oddsText = ['UH', 'H', 'M', 'L']
    .filter((tier) => probabilities[tier] > 0)
    .map((tier) => `${tier} ${Math.round(probabilities[tier] * 100)}%`)
    .join(' · ');

  return `
    <div class="insp-section">
      <div class="insp-row insp-muted" style="font-weight:bold">${t('inspect.wealthDistrictTitle')}</div>
      <div class="insp-row insp-ok">📍 ${districtName}</div>
      <div class="insp-row insp-muted">${oddsText}</div>
      <div class="insp-row insp-muted" style="font-size:10px">${t('inspect.wealthDistrictHint')}</div>
    </div>`;
}

// Commercial: the existing per-tile H/UH minimums checklist, unchanged.
function buildCommercialEligibilityHtml(row, col, bData, anchorRow, anchorCol, density) {
  const footprintSize = bData ? Math.max(bData.footprintCols ?? 1, bData.footprintRows ?? 1) : 1;
  const targetRow = bData ? anchorRow : row;
  const targetCol = bData ? anchorCol : col;

  const factors = getCommercialSiteFactors(targetRow, targetCol, footprintSize, createCommercialQualityContext());
  const hMinimums = COMMERCIAL_H_MINIMUMS;
  const uhMinimums = COMMERCIAL_UH_MINIMUMS;
  const factorKeys = ['quality', 'landValue', 'scenic', 'environment', 'economy', 'stockExchange', 'airport', 'pollution'];
  const densityOk = density === DENSITY_HIGH;
  const densityNoteKey = 'inspect.tierUhNeedsHighDensity';

  const rows = factorKeys.map((key) => {
    const value = factors[key] ?? 0;
    const hThreshold = getZoneEligibilityFactorThreshold(hMinimums, key);
    const uhThreshold = getZoneEligibilityFactorThreshold(uhMinimums, key);
    if (!hThreshold && !uhThreshold) return '';
    const label = t(ZONE_ELIGIBILITY_FACTOR_LABEL_KEYS[key]);
    const pct = `${Math.round(clampUnit(value) * 100)}%`;
    return `<div class="insp-row insp-muted">${label} ${pct} H${renderZoneEligibilityMark(hThreshold, value)} UH${renderZoneEligibilityMark(uhThreshold, value)}</div>`;
  }).join('');

  const hEligible = zonePassesMinimums(factors, hMinimums);
  const uhFactorsEligible = zonePassesMinimums(factors, uhMinimums);
  const uhEligible = uhFactorsEligible && densityOk;

  const hStatus = `<div class="insp-row ${hEligible ? 'insp-ok' : 'insp-fail'}">${t(hEligible ? 'inspect.tierHEligible' : 'inspect.tierHNotEligible')}</div>`;
  const uhStatus = `<div class="insp-row ${uhEligible ? 'insp-ok' : 'insp-fail'}">${t(uhEligible ? 'inspect.tierUhEligible' : 'inspect.tierUhNotEligible')}${uhEligible ? '' : t(densityNoteKey)}</div>`;

  return `
    <div class="insp-section">
      <div class="insp-row insp-muted" style="font-weight:bold">${t('inspect.growthEligibilityTitle')}</div>
      ${rows}
      <div class="insp-divider"></div>
      ${hStatus}
      ${uhStatus}
      <div class="insp-row insp-muted" style="font-size:10px">${t('inspect.economyIsCitywide')}</div>
    </div>`;
}

// Builds the "what drives this tile's wealth tier" panel section for a zoned
// residential/commercial tile. Returns '' for every other zone type.
function buildZoneEligibilityHtml(zone, row, col, bData, anchorRow, anchorCol, density) {
  if (zone === ZONE_RES) return buildResidentialWealthDistrictHtml(row, col);
  if (zone === ZONE_COM) return buildCommercialEligibilityHtml(row, col, bData, anchorRow, anchorCol, density);
  return '';
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
    hospital: `🏥 ${t('building.hospital')}`,
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
    hospital: t('inspect.healthRadius', { radius: HOSPITAL_RADIUS, upkeep: UPKEEP_HOSPITAL }),
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
    hospital:'#35b98f',
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
      const subLabelKey = bData.type === 'residential' ? (bData.wealthTier ?? 'L') : (bData.level ?? 1);
      const sl = getBuildingSubLabel(bData.type, subLabelKey);
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
  const healthScore = typeof getLocalHealthScore === 'function' ? getLocalHealthScore(row, col) : (svc?.health ?? 0);
  const healthPct = `${Math.round(clampUnit(healthScore) * 100)}%`;
  const hospitalCoveragePct = `${Math.round(clampUnit(svc?.health ?? 0) * 100)}%`;
  const healthPollution = typeof getLocalHealthPollutionPressure === 'function' ? getLocalHealthPollutionPressure(row, col) : 0;
  const healthPollutionPct = `${Math.round(clampUnit(healthPollution) * 100)}%`;
  const hospitalUsagePct = `${Math.round(Math.max(0, Math.min(1.35, Number(city.hospitalUtilization ?? 0))) * 100)}%`;
  const epidemicRiskPct = `${Math.round(clampUnit(city.epidemicRisk ?? 0) * 100)}%`;
  const epidemicSeverityPct = `${Math.round(clampUnit(city.epidemicSeverity ?? 0) * 100)}%`;

  let html = `
    <div class="insp-coord">[${row}, ${col}] — ${coordTitle}</div>
    ${spriteKeyInsp && (hasBldg || bData) ? `<div class="insp-sprite-key">${spriteKeyInsp}</div>` : ''}
    <div class="insp-row insp-muted">Terrain height: L${tileHeight} (${tileHeight * 100}m)</div>
    <div class="insp-row">${t('inspect.landValue', { value: landValuePct })}</div>
    <div class="insp-row">${t('inspect.happiness', { value: happinessPct })}</div>
    <div class="insp-row">${t('inspect.health', { value: healthPct })}</div>`;

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

    // Residential no longer labels itself by population-growth level (1/2/3)
    // - wealth tier is now the primary, player-planned classification (see
    // sim-wealth-districts.js), so it's keyed by wealthTier (L/M/H/UH)
    // instead. Commercial/industrial are unrelated to the district system and
    // keep their existing level-keyed display untouched.
    const BLDG_DISPLAY = {
      residential: {
        L: t('building.publicEstate'), M: t('building.privateResidence'), H: t('building.wealthyResidence'), UH: t('building.mansion'),
      },
      commercial:  { 1: t('building.smallShop'), 2: t('building.commercialBlockIcon'), 3: t('building.officeTowerIcon') },
      industrial:  { 1: t('building.smallFactory'), 2: t('building.industrialComplexIcon'), 3: t('building.heavyIndustryIcon') },
    };
    const BLDG_POP_LABEL = { residential: t('inspect.residents'), commercial: t('inspect.workers'), industrial: t('inspect.workers') };

    let bldgHtml = '';
    if (bData && BLDG_DISPLAY[bData.type]) {
      const isResidentialBldg = bData.type === 'residential';
      const lvl      = bData.level ?? 1;
      const dispKey  = isResidentialBldg ? (bData.wealthTier ?? 'L') : lvl;
      const dispName = BLDG_DISPLAY[bData.type][dispKey] ?? `${getBuildingTypeLabel(bData.type)} ${dispKey}`;
      const popLabel = BLDG_POP_LABEL[bData.type] ?? t('inspect.residents');
      const avgEducation = typeof getAverageEducationForBuilding === 'function'
        ? getAverageEducationForBuilding(bData, inspectRecord.anchorRow, inspectRecord.anchorCol)
        : 0;
      const avgEducationPct = `${Math.round(clampUnit(avgEducation) * 100)}%`;
      const occupancy = isResidentialBldg
        ? (bData.population ?? 0)
        : getBuildingJobCapacity(bData);
      const populationRow = isResidentialBldg
        ? t('inspect.residentPopulation', { population: occupancy.toLocaleString(), label: popLabel })
        : t('inspect.levelPopulation', { level: lvl, population: occupancy.toLocaleString(), label: popLabel });
      bldgHtml = `
        <div class="insp-bldg-name" style="color:${zColor}">${dispName}</div>
        <div class="insp-row insp-muted">${populationRow}</div>
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

    html += buildZoneEligibilityHtml(zone, row, col, bData, inspectRecord.anchorRow, inspectRecord.anchorCol, density);
  }

  // Service coverage
  if (svc || zone !== ZONE_NONE) {
    html += `
      <div class="insp-section">
        <div class="insp-row ${svc?.fire   ? 'insp-ok' : 'insp-muted'}">🚒 ${svc?.fire   ? t('inspect.fireProtected')  : t('inspect.noFireCover')}</div>
        <div class="insp-row ${svc?.police ? 'insp-ok' : 'insp-muted'}">👮 ${svc?.police ? t('inspect.policeCoverage') : t('inspect.noPoliceCover')}</div>
        <div class="insp-row ${svc?.park   ? 'insp-ok' : 'insp-muted'}">🌳 ${svc?.park === 2 ? t('inspect.largeParkNearby') : svc?.park === 1 ? t('inspect.smallParkNearby') : t('inspect.noParkNearby')}</div>
        <div class="insp-row ${svc?.health ? 'insp-ok' : 'insp-muted'}">🏥 ${svc?.health ? t('inspect.hospitalCoverage', { value: hospitalCoveragePct }) : t('inspect.noHospitalCover')}</div>
        <div class="insp-row insp-muted">🧑‍⚕️ ${t('inspect.hospitalUsage', { value: hospitalUsagePct })}</div>
        <div class="insp-row ${city.epidemicSeverity > 0.01 ? 'insp-warn' : 'insp-muted'}">🦠 ${t('inspect.epidemicStatus', { risk: epidemicRiskPct, severity: epidemicSeverityPct })}</div>
        <div class="insp-row insp-muted">🏭 ${t('inspect.healthPollution', { value: healthPollutionPct })}</div>
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
