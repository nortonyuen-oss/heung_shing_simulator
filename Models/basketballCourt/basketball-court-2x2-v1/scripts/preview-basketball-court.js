#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const ROOT=path.resolve(__dirname,'..'),ART=path.join(ROOT,'scripts/source-art/basketballCourt/v1');
async function main(){
 const crop={left:180,top:330,width:1240,height:800};
 const asset=path.join(ROOT,'Models/basketballCourt/bc_estateFullCourt_v1.png');
 await sharp(asset).extract(crop).flatten({background:'#f7f7f3'}).png().toFile(path.join(ART,'preview.png'));
 const images=['01-grid.png','02-layout.png','03-construction-guide.png',asset];
 const labels=['01 / 2 x 2 GRID - 40 x 40 m','02 / 28 x 15 m COURT + CLEAR FLOOR','03 / CONSTRUCTION GUIDE','04 / HONG KONG ESTATE COURT'];
 const layers=[];
 for(let i=0;i<images.length;i++){
  const x=(i%2)*660,y=Math.floor(i/2)*480;
  const input=path.isAbsolute(images[i])?images[i]:path.join(ART,images[i]);
  layers.push({input:await sharp(input).extract(crop).resize(620,400).flatten({background:'#f7f7f3'}).png().toBuffer(),left:x+20,top:y+55});
  layers.push({input:Buffer.from(`<svg width="620" height="35"><text x="0" y="24" font-family="sans-serif" font-size="16" fill="#475349">${labels[i]}</text></svg>`),left:x+20,top:y+12});
 }
 await sharp({create:{width:1320,height:960,channels:3,background:'#f7f7f3'}}).composite(layers).png().toFile(path.join(ART,'workflow.png'));
 console.log('Saved court preview and four-stage workflow.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
