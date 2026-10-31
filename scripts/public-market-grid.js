#!/usr/bin/env node
'use strict';

// Exact construction references, not a generated-image projection estimate.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '..');
const DEST = path.join(ROOT, 'scripts/source-art/publicMarket/grid-v2');
const W = 1600, H = 1400;
const P = (x, y, z = 0) => [200 + 10 * (x + y), 800 + 5 * (x - y) - 20 * z];
const pts = (a) => a.map((p) => P(...p).join(',')).join(' ');
const poly = (points, fill, stroke = '#87938f', sw = 0.65, extra = '') => `<polygon points="${pts(points)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;
const rect = (x, y, w, d, fill, z = 0, stroke, sw) => poly([[x,y,z],[x+w,y,z],[x+w,y+d,z],[x,y+d,z]], fill, stroke, sw);
const line = (a, b, color = '#92999a', width = 0.65) => `<polyline points="${pts([a,b])}" fill="none" stroke="${color}" stroke-width="${width}"/>`;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const label = (x, y, text, size = 22, color = '#334846') => { const [px,py] = P(x,y); return `<text x="${px}" y="${py}" text-anchor="middle" font-family="sans-serif" font-size="${size}" fill="${color}">${esc(text)}</text>`; };
const front = (x1, x2, y, z1, z2, color, stroke = '#89958d') => poly([[x1,y,z1],[x2,y,z1],[x2,y,z2],[x1,y,z2]], color, stroke);
const side = (x, y1, y2, z1, z2, color, stroke = '#89958d') => poly([[x,y1,z1],[x,y2,z1],[x,y2,z2],[x,y1,z2]], color, stroke);
function box(x,y,w,d,z,h, colors=['#cdd0c5','#aeb9b3','#e4e5da']) {
  return side(x+w,y,y+d,z,z+h,colors[1]) + front(x,x+w,y,z,z+h,colors[0]) + rect(x,y,w,d,colors[2],z+h);
}
function grid() {
  let s = rect(0,0,60,60,'none',0,'#90989a',0.8);
  for (const t of [20,40]) s += line([t,0,0],[t,60,0]) + line([0,t,0],[60,t,0]);
  return s;
}
function wrap(body) { return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#fafaf7"/>${body}</svg>`; }
function plan() {
  return rect(0,0,60,60,'#f2f0e8') + rect(0,0,60,16,'#dfead7') + rect(4,18,42,36,'#e3e3d7') + rect(48,18,12,40,'#eee1bd') + grid() +
    label(25,7,'前方小公園／入口前地') + label(25,37,'兩層街市 42 × 36 m') + label(54,36,'落貨區',18) +
    label(32,14,'入口',16) + `<text x="800" y="180" text-anchor="middle" font-family="sans-serif" font-size="26" fill="#334846">3 × 3 格 · 每格 20 × 20 m · 全場 60 × 60 m</text>`;
}
function frontSign(x1,x2,z1,z2,text,font) {
  const p = P((x1+x2)/2,17.8,(z1+z2)/2);
  return front(x1,x2,17.8,z1,z2,'#f4eedc') + `<g transform="translate(${p[0]},${p[1]}) matrix(1,0.5,0,1,0,0)"><text text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="${font}" fill="#9b3b31">${text}</text></g>`;
}
function massing() {
  let s = rect(0,0,60,60,'#ecebe4') + rect(0,0,60,16,'#e7e5d8') + rect(48,18,12,40,'#d8dbd7');
  // Guides first, so geometry occludes them naturally.
  s += grid();
  s += rect(50,22,9,13,'none',0,'#b9a34a',1.5);
  s += box(46,30,2,20,0,0.45,['#bfc4bc','#a2aca4','#d8d9d0']);
  s += box(4,18,42,36,0,6,['#dddcc9','#bdc7bb','#e1dfcf']);
  s += box(4,18,42,36,6,5.5,['#dddcc9','#bdc7bb','#e1dfcf']);
  // Horizontal green bands, aligned to the same exact world axes.
  for (const z of [5.55,10.8]) s += front(4,46,18,z,z+0.45,'#74938a') + side(46,18,54,z,z+0.45,'#668a7c');
  // Main front entrance plus wet-market counter bays.
  const bays = [[5,10],[12,17],[19,24],[26,31],[33,38],[40,45]];
  for (let i=0;i<bays.length;i++) {
    const [a,b]=bays[i];
    s += front(a,b,17.96,0.5,4.7,'#435650');
    if (i!==3) {
      s += box(a,16.8,b-a,1.2,0,1.05,['#b9c3b6','#8c9c90','#b2c6a2']);
      const col = i<2 ? '#b9796b' : '#809d64';
      s += front(a+0.2,b-0.2,16.75,1.05,1.55,col);
    }
    s += front(a,b,17.96,6.7,10.2,'#4f625b');
    for(let z=9.3;z<=10.2;z+=0.22) s += line([a,17.94,z],[b,17.94,z],'#9da69a',1);
    // Simple upper dining tables as geometry cues behind window openings.
    const [cx,cy]=P((a+b)/2,17.9,7.1);
    s += `<ellipse cx="${cx}" cy="${cy}" rx="15" ry="6" fill="#b7a47c"/>`;
  }
  for (const x of [4,11,18,25,32,39,45.5]) s += box(x,17.85,0.5,0.5,0,11.5,['#d1d1be','#b3bcae','#e2e1ce']);
  // Service shutters on the right elevation.
  for (const [a,b] of [[21,29],[33,41],[45,52]]) {
    s += side(46.03,a,b,0.5,4.6,'#687b71');
    for(let z=0.8;z<4.5;z+=0.25) s += line([46.05,a,z],[46.05,b,z],'#a2aaa1',0.8);
    s += side(46.03,a,b,7.0,10.2,'#657b70');
  }
  s += frontSign(25,33,4.7,5.7,'街市',25);
  s += frontSign(21,34,9.9,10.8,'熟食中心',20);
  // Roof parapet and roof services stay on exact +/-0.5 axes.
  s += box(4,53.5,42,0.5,11.5,0.7) + box(4,18,0.5,36,11.5,0.7) + box(45.5,18,0.5,36,11.5,0.7);
  s += box(20,35,10,2,11.5,1.0,['#aeb9b5','#8c9d96','#cdd5cf']);
  s += box(32,44,3,4,11.5,1.1,['#bec6bb','#9faf9e','#d5d9cd']);
  s += box(38,44,3,4,11.5,1.1,['#bec6bb','#9faf9e','#d5d9cd']);
  // Crates beside the loading platform, not across the public park.
  s += box(49,42,2,2,0,1.2,['#858e68','#687d54','#9fa97c']) + box(49,46,2,2,0,1.2,['#8b7e6c','#746959','#a89c85']);
  // Park furniture, front of market. Leave x=26..34 open for entrance route.
  for (const [x,y] of [[8,2.5],[20,2.5],[44,2.5]]) {
    s += box(x,y,6,1,0.6,0.15,['#ab8b62','#877454','#bca17b']);
    s += front(x,x+6,y+0.85,0.8,1.5,'#a58b67');
  }
  for (const [x,y] of [[10,8],[40,8],[53,8]]) {
    s += box(x-4,y-3,8,6,0,0.45,['#cbcbbb','#b1bca9','#728d61']);
    s += line([x,y,0.45],[x,y,4.8],'#847d64',6);
    const [cx,cy]=P(x,y,5.2);
    s += `<ellipse cx="${cx}" cy="${cy}" rx="69" ry="57" fill="#8fa77c" stroke="#748c68" stroke-width="1"/>`;
  }
  for (const [x,y] of [[19,10],[46,10]]) {
    s += line([x,y,0],[x,y,3.4],'#718277',2);
    const [cx,cy]=P(x,y,3.4); s += `<circle cx="${cx}" cy="${cy}" r="6" fill="#e4e3cd" stroke="#89948a"/>`;
  }
  return s;
}
async function main() {
  fs.mkdirSync(DEST,{recursive:true});
  for (const [name,body] of [['01-grid',grid()],['02-layout',plan()],['03-construction-guide',massing()]]) {
    const svg=wrap(body); fs.writeFileSync(path.join(DEST,`${name}.svg`),svg);
    await sharp(Buffer.from(svg)).png().toFile(path.join(DEST,`${name}.png`));
  }
  const corners=[[0,60,0],[60,60,0],[60,0,0],[0,0,0]].map((p)=>P(...p));
  const slope=(a,b)=>(b[1]-a[1])/(b[0]-a[0]);
  for(let i=0;i<4;i++) assert.equal(Math.abs(slope(corners[i],corners[(i+1)%4])),0.5);
  assert.equal((Math.max(...corners.map(p=>p[0]))-Math.min(...corners.map(p=>p[0])))/(Math.max(...corners.map(p=>p[1]))-Math.min(...corners.map(p=>p[1]))),2);
  const metadata={version:2,canvas:[W,H],siteMetres:[60,60],tileMetres:20,tiles:[3,3],projection:'screenX=200+10*(x+y); screenY=800+5*(x-y)-20*z',groundCorners:corners,groundAxisSlopes:[0.5,-0.5],groundWidthHeight:2,files:['01-grid.svg','01-grid.png','02-layout.svg','02-layout.png','03-construction-guide.svg','03-construction-guide.png'],generatedArtMatchesGuide:'must be checked separately; source geometry is exact, generated paint is not automatically certified'};
  fs.writeFileSync(path.join(DEST,'grid-geometry.json'),`${JSON.stringify(metadata,null,2)}\n`);
  console.log('Prepared exact 3×3 grid, layout, and construction reference. All 4 ground edges: +/-0.5; diamond width:height 2:1.');
}
if (require.main === module) main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports = { W, H, P, poly, rect, line, box, front, side, grid };
