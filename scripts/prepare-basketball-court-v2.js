#!/usr/bin/env node
'use strict';
// One global affine transform. No splines, control-point warps or local meshes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),sharp=require('sharp');
const {lineFit}=require('./prepare-public-market-style.js');
const ROOT=path.resolve(__dirname,'..'),W=1600,H=1400;
const SOURCE='scripts/source-art/basketballCourt/v1/render-source.png',OUT='Models/basketballCourt/bc_estateFullCourt_v2.png';
const META='data/basketball-court-geometry-v2.json';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function main(){
 const check=process.argv.includes('--check'),bytes=fs.readFileSync(path.join(ROOT,SOURCE));
 const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const left=lineFit(data,info.width,info.height,90,600,false),right=lineFit(data,info.width,info.height,760,1260,false);
 const sourceFront=[(right.intercept-left.intercept)/(left.slope-right.slope),0];
 sourceFront[1]=left.slope*sourceFront[0]+left.intercept;
 const a=1120/(1315-34),d=a/(left.slope-right.slope),b=a/2-d*left.slope,tx=240-a*34,ty=1080-b*sourceFront[0]-d*sourceFront[1];
 const forward=([x,y])=>[a*x+tx,b*x+d*y+ty];
 // All source lines remain lines, including elevated rails crossing ground lines.
 let maxLineDeviation=0;
 const lines=[[[207,511],[1153,624]],[[572,320],[1153,624]],[[332,628],[775,864]],[[805.5,614],[553.5,746]],[[187,425],[187,698]],[[736,708],[736,938]]];
 for(const [s,t]of lines){const A=forward(s),B=forward(t);for(let j=0;j<=100;j++){const f=j/100,p=forward([s[0]+(t[0]-s[0])*f,s[1]+(t[1]-s[1])*f]);maxLineDeviation=Math.max(maxLineDeviation,Math.hypot(p[0]-(A[0]+(B[0]-A[0])*f),p[1]-(A[1]+(B[1]-A[1])*f)));}}
 assert(maxLineDeviation<1e-9);assert.equal(forward([187,425])[0],forward([187,698])[0]);
 const out=Buffer.alloc(W*H*4);
 for(let x=0;x<W;x++){
  const sx=(x-tx)/a;if(sx< -1||sx>=info.width)continue;const ix=Math.floor(sx),fx=sx-ix;
  for(let y=0;y<H;y++){
   const sy=(y-ty-b*sx)/d;if(sy< -1||sy>=info.height)continue;const iy=Math.floor(sy),fy=sy-iy;let alpha=0,r=0,g=0,blue=0;
   for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++){const X=ix+xx,Y=iy+yy;if(X<0||Y<0||X>=info.width||Y>=info.height)continue;const p=(Y*info.width+X)*4,w=(xx?fx:1-fx)*(yy?fy:1-fy)*data[p+3];alpha+=w;r+=data[p]*w;g+=data[p+1]*w;blue+=data[p+2]*w;}
   const p=(y*W+x)*4,A=Math.round(alpha);if(A<=1)continue;out[p]=Math.round(r/alpha);out[p+1]=Math.round(g/alpha);out[p+2]=Math.round(blue/alpha);out[p+3]=A;
  }
 }
 const raster={frontLeft:lineFit(out,W,H,290,740,false),frontRight:lineFit(out,W,H,860,1300,false)};
 assert(Math.abs(raster.frontLeft.slope-.5)<.002);assert(Math.abs(raster.frontRight.slope+.5)<.002);
 let border=0;for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(x<8||y<8||x>=W-8||y>=H-8)border=Math.max(border,out[(y*W+x)*4+3]);assert.equal(border,0);
 const cfg=JSON.parse(fs.readFileSync(path.join(ROOT,'scripts/source-art/basketballCourt/v1/registration.json')));
 const landmarks=cfg.anchors.map(p=>({name:p.name,source:p.source,output:forward(p.source)}));
 const png=await sharp(out,{raw:{width:W,height:H,channels:4}}).png().toBuffer();
 const meta={version:2,source:SOURCE,sourceSha256:hash(bytes),output:OUT,outputSha256:hash(png),canvas:[W,H],runtimeIntegrated:false,method:'Single global affine transformation; straight lines and screen verticals preserved. No local warp.',affine:[[a,0,tx],[b,d,ty]],sourceFrontEdgeFits:{left,right},rasterFootprintEdges:raster,maxIntroducedLineDeviationPixels:maxLineDeviation,verticalsRetainScreenX:true,alphaBorderMax:border,landmarks,nominalDesign:{tiles:[2,2],tileMetres:20,siteMetres:[40,40],courtMetres:[28,15]},limitations:'Generated source has small internal placement/proportion differences from the exact guide. This correction aligns the two front ground axes to +/-0.5 without forcing all source corners or props onto ideal control points. A pixel-exact 40x40 m square and exact 28x15 m playing rectangle are not claimed.'};
 if(check){assert.deepEqual(JSON.parse(fs.readFileSync(path.join(ROOT,META))),meta);assert.equal(hash(fs.readFileSync(path.join(ROOT,OUT))),hash(png));}else{fs.writeFileSync(path.join(ROOT,OUT),png);fs.writeFileSync(path.join(ROOT,META),JSON.stringify(meta,null,2)+'\n');}
 assert.equal(hash(fs.readFileSync(path.join(ROOT,SOURCE))),hash(bytes));
 console.log(JSON.stringify({mode:check?'verified':'prepared',raster,maxIntroducedLineDeviationPixels:maxLineDeviation,alphaBorderMax:border}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={main};
