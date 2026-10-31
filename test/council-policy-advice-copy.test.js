'use strict';

// Every policy's lead officials are quoted in the council's 官員專業意見 panel through
// council.advice.<officialId>.<support|concern> (council-policy-preview.js). A lead without that
// copy showed its raw key - 北極企鵝保育區 (tourism councillor) and 長者兩蚊 (religious
// councillor) did, until councillors got advice copy of their own (Norton 2026-10-31).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const source = (fileName) => fs.readFileSync(path.join(ROOT, fileName), 'utf8');

test('every policy lead official has support and concern advice in en, zh and ja', () => {
  const preview = source('council-policy-preview.js');
  const i18n = source('i18n.js');
  const leads = new Set();
  for (const match of preview.matchAll(/^\s+(\w+): \{[^\n]*leadOfficialIds: \[([^\]]*)\]/gm)) {
    for (const id of match[2].matchAll(/'([a-z_]+)'/g)) leads.add(id[1]);
  }
  assert.ok(leads.has('councillor_tourism') && leads.has('councillor_religion') && leads.has('treasury_head'), 'parsed the metadata table');
  for (const id of leads) for (const stance of ['support', 'concern']) {
    const key = `'council.advice.${id}.${stance}'`;
    assert.equal(i18n.split(key).length - 1, 3, `${key} in all three languages`);
  }
});
