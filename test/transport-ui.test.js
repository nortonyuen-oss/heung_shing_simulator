const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('transport tool palette uses direct OpenTTD-style operation windows, not the old manage-network tag', () => {
  const html = source('index.html');
  const menu = source('tool-menu.js');
  const translations = source('i18n.js');

  assert.doesNotMatch(html, /transport\.manage|Manage Bus Network|管理巴士網絡/);
  assert.doesNotMatch(translations, /'transport\.manage'/);
  // the four windows open from named topbar buttons; the tool menu holds only map tools
  for (const tab of ['routes', 'fleet', 'demand', 'finances']) {
    assert.match(html, new RegExp(`data-transport-topbar-panel="${tab}"[^>]*>.*data-i18n="transport\\.nav\\.${tab}"`));
  }
  assert.doesNotMatch(html, /data-action="open-transport-tab"/);
  assert.match(html, /data-tool-category="transport"/);
  assert.match(html, /data-tool-category="transport-ferry"/);
  assert.match(html, /id="play-mode-switch"/);
  assert.match(html, /data-action="new-bus-route"/);
  assert.match(menu, /startNewTransportRoute\(\)/);
  assert.match(menu, /openTransportWindowTab\(actionButton\.dataset\.transportTab\)/);
});

test('the six old transport windows fold into four, and old ids open the tab that took them over', () => {
  const ui = source('transport-ui.js');
  assert.match(ui, /const TRANSPORT_PANEL_IDS = \['routes', 'fleet', 'demand', 'finances'\];/);
  assert.match(ui, /depot: \['fleet', 'buy'\]/);
  assert.match(ui, /company: \['finances', 'company'\]/);
  assert.match(ui, /data-transport-action="route-add-bus"/);
  assert.match(ui, /data-transport-action="route-withdraw-bus"/);
});

test('transport console exposes routes, fleet, demand, depot, finances and company workflows', () => {
  const ui = source('transport-ui.js');
  for (const renderer of [
    'renderTransportRoutesTab',
    'renderTransportFleetTab',
    'renderTransportDemandTab',
    'renderTransportDepotTab',
    'renderTransportFinancesTab',
    'renderTransportCompanyTab',
  ]) {
    assert.match(ui, new RegExp(`function ${renderer}\\(`));
  }
  assert.match(ui, /data-transport-fleet-sort/);
  assert.match(ui, /data-transport-action="locate-stop"/);
  assert.match(ui, /state\.financeHistory/);
  assert.match(ui, /transport\.farePerTileShort/);
  assert.match(ui, /transport\.metric\.fareDistance/);
});

test('individual vehicle action opens the shared live tracker with route, depot and sale controls', () => {
  const ui = source('transport-ui.js');
  const tracker = source('vehicle-tracker.js');
  assert.match(ui, /openVehicleTrackingWindow\('transport', vehicleId, pointer, options\)/);
  assert.match(tracker, /data-vehicle-tracker-action=\"route\"/);
  assert.match(tracker, /data-vehicle-tracker-action=\"depot\"/);
  assert.match(tracker, /data-vehicle-tracker-action=\"sell\"/);
  assert.match(tracker, /transport\.inspector\.currentLeg/);
  assert.match(tracker, /transport\.tracker\.locateMain/);
});

test('bus company profit stays out of the mayor budget and is reported in the company ledger', () => {
  const cityState = source('city-state.js');
  const transport = source('transport-expansion.js');
  assert.doesNotMatch(cityState, /getTransportFinancials\(\)/);
  assert.match(cityState, /const transportIncome = 0;/);
  assert.match(cityState, /const transportCost = 0;/);
  assert.match(transport, /state\.financeHistory\.push\(/);
});

test('every transport tool, window and checklist step has its words in all three languages', () => {
  const translations = source('i18n.js');
  const keys = [
    ...['bus-stop', 'bus-depot', 'ferry-pier', 'ferry-route', 'pickStops', 'stopHere', 'cancel'].map((k) => `transport.hint.${k}`),
    ...['routes', 'fleet', 'demand', 'finances'].map((k) => `transport.help.${k}`),
    ...['stops', 'depot', 'route', 'bus', 'ferry'].flatMap((k) => [`transport.checklist.${k}`, `transport.checklist.${k}Go`]),
    ...['noBuses', 'suspended', 'weather', 'noDepot', 'depotCutOff'].map((k) => `transport.issue.${k}`),
  ];
  for (const key of keys) {
    const count = translations.split(`'${key}':`).length - 1;
    assert.equal(count, 3, `${key} should appear once per language, found ${count}`);
  }
  const ui = source('transport-ui.js');
  assert.match(ui, /function cancelTransportModeTool\(/);
  assert.match(source('main.js'), /drawTransportCatchmentPreview\(this, cur\.row, cur\.col\)/);
});

test('transport charts: finance overview, route trend lines, and transport series in the city chart window', () => {
  const ui = source('transport-ui.js');
  const chart = source('chart-window.js');
  const html = source('index.html');
  assert.match(ui, /function renderTransportFinanceCharts\(/);
  assert.match(ui, /renderTransportSparkline\(route\.history, route\.color\)/);
  assert.match(source('ferry-ui.js'), /renderTransportSparkline\(route\.history, route\.color\)/);
  for (const key of ['transportPassengers', 'transportRevenue', 'transportNet', 'transportCash']) {
    assert.match(chart, new RegExp(`${key}: \\{`));
    assert.match(html, new RegExp(`data-chart-series="${key}"`));
  }
  // the chart window is no longer hidden in transport mode
  assert.doesNotMatch(html, /body\.transport-mode #chart-window/);
});

test('city chart lines up series by month label, so a later-starting series begins part way along', () => {
  const vm = require('node:vm');
  const context = vm.createContext({ console });
  vm.runInContext(source('chart-window.js') + `
    ;globalThis.getTransportExpansionState = () => ({ financeHistory: [
      { year: 3027, month: 8, passengers: 10, revenue: 5, net: 1, closingCash: 100 },
      { year: 3027, month: 9, passengers: 20, revenue: 6, net: -2, closingCash: 90 },
    ] });
    globalThis.series = getTransportChartHistory('passengers');
  `, context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.series)), [
    { label: '3027-08', value: 10 },
    { label: '3027-09', value: 20 },
  ]);
});
