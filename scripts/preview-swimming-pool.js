#!/usr/bin/env node
'use strict';
const path=require('node:path'),sharp=require('sharp');
const ROOT=path.resolve(__dirname,'..'),ART=path.join(ROOT,'scripts/source-art/swimmingPool/v1');
async function main(){
 const crop={left:140,top:400,width:1320,height:760},asset=path.join(ROOT,'Models/swimmingPool/sp_simple3x3_v1.png');
 await sharp(asset).extract(crop).flatten({background:'#f7f7f3'}).png().toFile(path.join(ART,'preview.png'));
 const images=['01-grid.png','02-layout.png','03-construction-guide.png',asset],labels=['01 / 3 x 3 DESIGN GRID - 60 x 60 m','02 / SINGLE MAIN POOL LAYOUT','03 / CONSTRUCTION GUIDE','04 / SIMPLE HONG KONG PUBLIC POOL'],layers=[];
 for(let i=0;i<4;i++){
  const x=(i%2)*700,y=Math.floor(i/2)*450,input=path.isAbsolute(images[i])?images[i]:path.join(ART,images[i]);
  layers.push({input:await sharp(input).extract(crop).resize(660,380).flatten({background:'#f7f7f3'}).png().toBuffer(),left:x+20,top:y+50});
  layers.push({input:Buffer.from(`<svg width="660" height="32"><text x="0" y="23" font-family="sans-serif" font-size="17" fill="#475349">${labels[i]}</text></svg>`),left:x+20,top:y+10});
 }
 await sharp({create:{width:1400,height:900,channels:3,background:'#f7f7f3'}}).composite(layers).png().toFile(path.join(ART,'workflow.png'));
 console.log('Saved swimming pool preview and grid/layout/construction/render workflow.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
