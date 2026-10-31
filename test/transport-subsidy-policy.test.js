'use strict';

// 政府補貼 (Norton 2026-10-31): a council act paying the transport company part of its running costs.
// Registered everywhere a policy must be; the payment itself is in transport-expansion.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = (fileName) => fs.readFileSync(path.join(__dirname, '..', fileName), 'utf8');

test('公共交通營運補貼 is a full policy whose cost is the subsidy it pays', () => {
  const context = vm.createContext({});
  vm.runInContext(source('constants.js'), context);
  const policy = vm.runInContext(`CITY_POLICY_DEFS.find((p) => p.id === 'transportOperatingSubsidy')`, context);
  assert.ok(policy);
  assert.equal(policy.category, 'safetyTransport');
  const state = source('city-state.js');
  assert.equal(state.match(/transportOperatingSubsidy: false,/g)?.length, 2);
  assert.match(state, /CITY_STATE_POLICY_IDS = Object\.freeze\(\[[^\]]*'transportOperatingSubsidy'/);
  for (const file of ['city-state.js', 'council-policy-preview.js']) {
    assert.match(source(file), /transportOperatingSubsidy' && typeof getTransportOperatingSubsidyDue === 'function'\) cost \+= getTransportOperatingSubsidyDue\(\)/, file);
  }
  assert.match(source('council-policy-preview.js'), /transportOperatingSubsidy: \{ issues:/);
  const i18n = source('i18n.js');
  for (const key of ['policy.transportOperatingSubsidy.title', 'policy.transportOperatingSubsidy.desc', 'transport.finance.subsidy', 'transport.finance.subsidyDue']) {
    assert.equal(i18n.split(`'${key}':`).length - 1, 3, key);
  }
});
