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
  for (const tab of ['routes', 'fleet', 'demand', 'finances']) {
    assert.match(html, new RegExp(`data-action="open-transport-tab" data-transport-tab="${tab}"`));
  }
  assert.match(menu, /openTransportWindowTab\(actionButton\.dataset\.transportTab\)/);
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

test('individual vehicle window supports following, route orders, depot recall and sale', () => {
  const ui = source('transport-ui.js');
  assert.match(ui, /data-transport-inspector-follow/);
  assert.match(ui, /data-transport-inspector-route/);
  assert.match(ui, /data-transport-inspector-depot/);
  assert.match(ui, /data-transport-inspector-sell/);
  assert.match(ui, /transport\.inspector\.currentLeg/);
  assert.match(ui, /transport\.inspector\.purchasePrice/);
});

test('bus company profit stays out of the mayor budget and is reported in the company ledger', () => {
  const cityState = source('city-state.js');
  const transport = source('transport-expansion.js');
  assert.doesNotMatch(cityState, /getTransportFinancials\(\)/);
  assert.match(cityState, /const transportIncome = 0;/);
  assert.match(cityState, /const transportCost = 0;/);
  assert.match(transport, /state\.financeHistory\.push\(/);
});
