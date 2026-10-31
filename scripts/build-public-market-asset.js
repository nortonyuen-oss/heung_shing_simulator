#!/usr/bin/env node
'use strict';

// Textures are generated; architecture and footprint are exact projected geometry.
// No imagegen redraw is used as the final building silhouette.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { W, H, P, poly, rect, line, box, front, grid } = require('./public-market-grid.js');
const ROOT = path.resolve(__dirname, '..');
const SRC = 'scripts/source-art/publicMarket/grid-v2';
const OUT = 'Models/publicMarket';
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const read = p => fs.readFileSync(path.join(ROOT,p));
const uri = b => `data:image/png;base64,${b.toString('base64')}`;
const slope = (a,b) => (b[1]-a[1])/(b[0]-a[0]);

function plane(png, a, b, d) {
  // UV image [0..1]^2 maps affinely to a world-space rectangular plane.
  const A=P(...a),B=P(...b),D=P(...d);
  return `<image width="1" height="1" preserveAspectRatio="none" href="${uri(png)}" transform="matrix(${B[0]-A[0]},${B[1]-A[1]},${D[0]-A[0]},${D[1]-A[1]},${A[0]},${A[1]})"/>`;
}
async function tile(png,n=4) {
  const thumb=await sharp(png).resize(256,256).png().toBuffer();
  const composites=[];
  for(let y=0;y<n;y++)for(let x=0;x<n;x++) composites.push({input:thumb,left:x*256,top:y*256});
  return sharp({create:{width:n*256,height:n*256,channels:4,background:'#00000000'}}).composite(composites).png().toBuffer();
}
function planter(x,y) {
  let s=box(x-4,y-3,8,6,0,0.45,['#cfcec0','#b0b8ac','#60764e']);
  for(let i=0;i<45;i++) {
    const xx=x-3.7+((i*37)%71)/10, yy=y-2.8+((i*29)%55)/10;
    const [px,py]=P(xx,yy,0.48);
    s+=`<ellipse cx="${px}" cy="${py}" rx="${2+i%3}" ry="${1+i%3/2}" fill="${['#708855','#819765','#516d43','#958664'][i%4]}"/>`;
  }
  return s;
}
function bench(x,y) {
  let s='';
  for(const xx of [x+0.2,x+2.6])s+=box(xx,y,0.16,0.55,0,0.5,['#606a61','#485b4e','#798575']);
  for(let j=0;j<3;j++)s+=box(x,y+j*0.19,3,0.14,0.5,0.07,['#aa8557','#8b724f','#c2a276']);
  for(let z=0.75;z<1.1;z+=0.12)s+=front(x,x+3,y+0.6,z,z+0.09,'#a98a60');
  return s;
}
function lamp(x,y) {
  const [px,py]=P(x,y,3.4);
  return line([x,y,0],[x,y,3.4],'#3f5749',2.4)+`<circle cx="${px}" cy="${py}" r="5.5" fill="#f4ebce" stroke="#a9b29b" stroke-width="1"/>`;
}
function crates() {
  let s='';
  for (const [x,y] of [[49,42],[49.3,46],[53,49]]) {
    s+=box(x-0.2,y-0.15,1.3,1.2,0,0.15,['#99836a','#776e58','#b1a181']);
    for(let j=0;j<3;j++) {
      const z=0.15+j*0.38;
      s+=box(x,y,0.95,0.8,z,0.34,['#77865b','#536e49','#8e9b72']);
      s+=line([x+0.06,y-0.01,z+0.13],[x+0.9,y-0.01,z+0.13],'#445b3b',1);
    }
  }
  const x=54,y=40;
  for(const xx of [x,x+0.6])s+=box(xx,y,0.16,2.2,0.08,0.12,['#d3aa3c','#a98728','#edc34a']);
  s+=box(x-0.05,y+1.8,0.95,0.45,0.15,0.25,['#d0a437','#b58d2c','#e1b748']);
  s+=line([x+0.4,y+2.1,0.3],[x+0.4,y+2.1,1.4],'#37483f',2);
  const [px,py]=P(x+0.4,y+2.1,1.4);
  s+=`<ellipse cx="${px}" cy="${py}" rx="4" ry="6" fill="none" stroke="#37483f" stroke-width="2"/>`;
  return s;
}
function equipment() {
  let s='';
  for(const [x,y,w,d,h] of [[20,35,10,2,1],[32,44,3,4,1.1],[38,44,3,4,1.1]]) {
    s+=rect(x+0.2,y-0.2,w,d,'#00000024',11.51);
    s+=box(x,y,w,d,11.5,h,['#899b9e','#6b8083','#c0cbcb']);
    for(let xx=x+0.25;xx<x+w-0.1;xx+=0.3)s+=line([xx,y-0.01,11.65],[xx,y-0.01,11.5+h-0.15],'#415a5c',0.65);
  }
  return s;
}
function architecture(t) {
  let s=rect(3.8,17.8,42.4,36.4,'#00000022');
  s+=plane(t.side,[46,18,11.5],[46,54,11.5],[46,18,0]);
  s+=poly([[46,18,11.5],[46,54,11.5],[46,54,0],[46,18,0]],'#11201b12','none');
  s+=plane(t.front,[4,18,11.5],[46,18,11.5],[4,18,0]);
  s+=plane(t.roof,[4,54,11.5],[46,54,11.5],[4,18,11.5]);
  const c=['#d1d2c5','#acb8ac','#e0e0d3'];
  s+=box(4,53.65,42,0.35,11.5,0.7,c)+box(4,18,0.35,36,11.5,0.7,c);
  s+=box(4,18,42,0.35,11.5,0.5,c)+box(45.65,18,0.35,36,11.5,0.5,c);
  s+=equipment();
  return s;
}
async function main() {
  const check=process.argv.includes('--check');
  const atlasPath=`${SRC}/texture-atlas.png`, bytes=read(atlasPath);
  const atlas=sharp(bytes), info=await atlas.metadata();
  assert.equal(info.width,1254); assert.equal(info.height,1254);
  const crops={front:[0,0,618,618],side:[636,0,618,618],roof:[0,636,618,618],paving:[636,636,618,618]};
  const textures={};
  for(const [key,[left,top,width,height]] of Object.entries(crops))textures[key]=await sharp(bytes).extract({left,top,width,height}).png().toBuffer();
  const pavers=await tile(textures.paving,4), yard=await tile(textures.roof,2);
  const treeFiles=['Models/trees/tree02.png','Models/trees/tree08.png','Models/trees/tree02.png'];
  const trees=treeFiles.map(file=>({file,bytes:read(file)}));
  const gridGeometry=JSON.parse(read(`${SRC}/grid-geometry.json`));
  const files=new Map();
  const scene=async withGrid=>{
    let s=plane(pavers,[0,60,0],[60,60,0],[0,0,0]);
    s+=plane(yard,[48,58,0],[60,58,0],[48,18,0]);
    s+=rect(26,0,8,18,'#eae8dc35');
    s+=rect(50,22,9,13,'none',0,'#d3b550',1.7);
    s+=box(46,30,1.8,20,0,0.4,['#b7bcb5','#98a79b','#d0d1c6']);
    if(withGrid)s+=grid();
    s+=crates()+architecture(textures);
    const positions=[[10,8],[40,8],[53,8]];
    for(let i=0;i<positions.length;i++){
      const [x,y]=positions[i];s+=planter(x,y);
      const image=await sharp(trees[i].bytes).trim().png().toBuffer();
      const im=await sharp(image).metadata();
      const height=150,width=height*im.width/im.height,[px,py]=P(x,y,0.45);
      s+=`<image href="${uri(image)}" x="${px-width/2}" y="${py-height}" width="${width}" height="${height}"/>`;
    }
    for(const [x,y] of [[8,2.5],[20,2.5],[44,2.5]])s+=bench(x,y);
    for(const [x,y] of [[19,10],[46,10]])s+=lamp(x,y);
    return s;
  };
  const root=body=>`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`;
  const body=await scene(true),cleanBody=await scene(false);
  const svg=root(body),cleanSvg=root(cleanBody);
  const png=await sharp(Buffer.from(svg)).png().toBuffer();
  const clean=await sharp(Buffer.from(cleanSvg)).png().toBuffer();
  files.set(`${OUT}/pm_market3x3_grid_v2.svg`,Buffer.from(svg));
  files.set(`${OUT}/pm_market3x3_grid_v2.png`,png);
  files.set(`${OUT}/pm_market3x3_clean_v2.png`,clean);
  const audit = root(`<rect width="100%" height="100%" fill="#f4f3ee"/>${body}`+
    poly([[0,0,0],[60,0,0],[60,60,0],[0,60,0]],'none','#65939b',1.1)+
    poly([[4,18,11.5],[46,18,11.5],[46,54,11.5],[4,54,11.5]],'none','#ae9254',1.1));
  files.set(`${SRC}/04-market.png`,png);
  files.set(`${SRC}/05-geometry-audit.png`,await sharp(Buffer.from(audit)).png().toBuffer());
  const corners=gridGeometry.groundCorners;
  for(let i=0;i<4;i++)assert.equal(Math.abs(slope(corners[i],corners[(i+1)%4])),0.5);
  const roof=[[4,18,11.5],[46,18,11.5],[46,54,11.5],[4,54,11.5]].map(p=>P(...p));
  for(let i=0;i<4;i++)assert.equal(Math.abs(slope(roof[i],roof[(i+1)%4])),0.5);
  for(const [x,y] of [[4,18],[46,18],[46,54],[4,54]])assert.equal(P(x,y,0)[0],P(x,y,11.5)[0]);
  const {data,info:rawInfo}=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let edgeMax=0,transparent=0;
  for(let y=0;y<rawInfo.height;y++)for(let x=0;x<rawInfo.width;x++){
    const a=data[(y*rawInfo.width+x)*4+3];if(!a)transparent++;
    if(x<8||y<8||x>=W-8||y>=H-8)edgeMax=Math.max(edgeMax,a);
  }
  assert.equal(edgeMax,0);assert(transparent>0);
  assert.equal(sha(read(atlasPath)),sha(bytes));
  const manifest={version:2,runtimeIntegrated:false,method:'Generated flat UV textures on exact world-coordinate planes; NOT a reprojected whole painting',canvas:[W,H],siteMetres:[60,60],tiles:[3,3],tileMetres:20,projection:gridGeometry.projection,groundCorners:corners,groundWidthHeight:2,roofCorners:roof,groundAndRoofAxisSlopes:[0.5,-0.5],verticalsRetainScreenX:true,building:{origin:[4,18],footprint:[42,36],roofHeight:11.5,storeys:2},park:{origin:[0,0],footprint:[60,16]},loading:{origin:[48,18],footprint:[12,40]},sourceAtlas:{path:atlasPath,sha256:sha(bytes),crops},reusedTrees:trees.map(t=>({path:t.file,sha256:sha(t.bytes)})),alpha:{borderMax:edgeMax,transparentPercent:Number((100*transparent/(W*H)).toFixed(2))},files:[...files].map(([file,bytes])=>({path:file,sha256:sha(bytes)}))};
  const meta='data/public-market-geometry.json';
  if(check){
    assert.deepEqual(JSON.parse(read(meta)),manifest);
    for(const [file,bytes] of files)assert.equal(sha(read(file)),sha(bytes));
  }else{
    for(const [file,bytes] of files){fs.mkdirSync(path.dirname(path.join(ROOT,file)),{recursive:true});fs.writeFileSync(path.join(ROOT,file),bytes);}
    fs.writeFileSync(path.join(ROOT,meta),`${JSON.stringify(manifest,null,2)}\n`);
  }
  console.log(`${check?'Verified':'Built'} exact 3×3 market: ground AND roof edges +/-0.5; width:height 2:1; verticals upright; alpha border clear; source atlas unchanged.`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
