#!/usr/bin/env node
// Export the same vectors used inline by the cabinet for designers and other game surfaces.
const fs = require('node:fs');
const path = require('node:path');
const { renderBauhiniaMedalSvg } = require('../medal-art');
const target = path.resolve(__dirname, '../UI/medals');
fs.mkdirSync(target, { recursive: true });
for (const tier of ['bronze', 'silver', 'gold', 'bauhinia', 'black', 'memorial', 'grand', 'secret']) {
  fs.writeFileSync(path.join(target, `bauhinia-${tier}.svg`), renderBauhiniaMedalSvg(tier).replace(/[ \t]+$/gm, '') + '\n');
}
