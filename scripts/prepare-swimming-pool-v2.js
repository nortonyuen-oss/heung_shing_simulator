#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),sharp=require('sharp');
const {lineFit}=require('./prepare-public-market-style.js');
const {P,W,H}=require('./swimming-pool-guide.js');
const ROOT=path.resolve(__dirname,'..'),ART='scripts/source-art/swimmingPool/v2',SOURCE=ART+'/render-source.png',OUT='Models/swimmingPool/sp_simple3x3_v2.png',META='data/swimming-pool-geometry-v2.json';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function main(){
 const check=process.argv.includes('--check'),bytes=fs.readFileSync(path.join(ROOT,SOURCE));
 const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const left=lineFit(data,info.width,info.height,150,700,false),right=lineFit(data,info.width,info.height,950,1500,false);
 const front=[(right.intercept-left.intercept)/(left.slope-right.slope),0];front[1]=left.slope*front[0]+left.intercept;
 const a=1200/(1617-58),d=a/(left.slope-right.slope),b=a/2-d*left.slope,tx=200-a*58,ty=1100-b*front[0]-d*front[1];
 const forward=([x,y])=>[a*x+tx,b*x+d*y+ty];
 // A single affine map preserves EVERY source straight line, even where elevated
 // rails overlap ground lines. No local mesh, spline or displacement field.
 let maxIntroducedLineDeviation=0;
 for(const [s,t]of [[[182,543],[599,757]],[[630,363],[1148,654]],[[658,192],[658,320]],[[270,683],[600,856]],[[239,409],[239,510]]]){
  const A=forward(s),B=forward(t);for(let j=0;j<=100;j++){const f=j/100,p=forward([s[0]+(t[0]-s[0])*f,s[1]+(t[1]-s[1])*f]);maxIntroducedLineDeviation=Math.max(maxIntroducedLineDeviation,Math.hypot(p[0]-(A[0]+(B[0]-A[0])*f),p[1]-(A[1]+(B[1]-A[1])*f)));}
 }
 assert(maxIntroducedLineDeviation<1e-9);assert.equal(forward([658,192])[0],forward([658,320])[0]);
 const out=Buffer.alloc(W*H*4);
 for(let x=0;x<W;x++){
  const sx=(x-tx)/a;if(sx< -1||sx>=info.width)continue;const ix=Math.floor(sx),fx=sx-ix;
  for(let y=0;y<H;y++){
   const sy=(y-ty-b*sx)/d;if(sy< -1||sy>=info.height)continue;const iy=Math.floor(sy),fy=sy-iy;let alpha=0,r=0,g=0,blue=0;
   for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++){const X=ix+xx,Y=iy+yy;if(X<0||Y<0||X>=info.width||Y>=info.height)continue;const p=(Y*info.width+X)*4,w=(xx?fx:1-fx)*(yy?fy:1-fy)*data[p+3];alpha+=w;r+=data[p]*w;g+=data[p+1]*w;blue+=data[p+2]*w;}
   const p=(y*W+x)*4,A=Math.round(alpha);if(A<=1)continue;out[p]=Math.round(r/alpha);out[p+1]=Math.round(g/alpha);out[p+2]=Math.round(blue/alpha);out[p+3]=A;
  }
 }
 // Audit the actual water rectangle, not only its outer alpha silhouette.
 function waterEdge(x0,x1,top){
  const pts=[];
  for(let x=x0;x<=x1;x++){
   let edge=top?Infinity:-Infinity;
   for(let y=150;y<850;y++){const p=(y*info.width+x)*4,r=data[p],g=data[p+1],B=data[p+2];if(data[p+3]>200&&g>130&&B>150&&B>r*1.5&&g>r*1.5)edge=top?Math.min(edge,y):Math.max(edge,y);}
   if(Number.isFinite(edge))pts.push([x,edge]);
  }
  const mx=pts.reduce((s,p)=>s+p[0],0)/pts.length,my=pts.reduce((s,p)=>s+p[1],0)/pts.length;
  const m=pts.reduce((s,p)=>s+(p[0]-mx)*(p[1]-my),0)/pts.reduce((s,p)=>s+(p[0]-mx)**2,0);
  return {sourceSlope:m,outputSlope:(b+d*m)/a};
 }
 const waterEdges={rearLong:waterEdge(900,1300,true),frontLong:waterEdge(720,980,false),leftShort:waterEdge(490,730,true),rightShort:waterEdge(1130,1370,false)};
 for(const edge of Object.values(waterEdges))assert(Math.abs(Math.abs(edge.outputSlope)-.5)<.04);
 assert(Math.abs(d/a-1)<.05,'Do not flatten the building to fix the parcel');
 const raster={frontLeft:lineFit(out,W,H,270,730,false),frontRight:lineFit(out,W,H,870,1320,false)};
 assert(Math.abs(raster.frontLeft.slope-.5)<.002);assert(Math.abs(raster.frontRight.slope+.5)<.002);
 let border=0;for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(x<8||y<8||x>=W-8||y>=H-8)border=Math.max(border,out[(y*W+x)*4+3]);assert.equal(border,0);
 const png=await sharp(out,{raw:{width:W,height:H,channels:4}}).png().toBuffer(),layout=JSON.parse(fs.readFileSync(path.join(ROOT,ART,'layout.json')));
 const meta={version:2,source:SOURCE,sourceSha256:hash(bytes),output:OUT,outputSha256:hash(png),canvas:[W,H],layout,runtimeIntegrated:true,generationMode:'built-in image_gen, geometry-only reference repaint',method:'Single global affine scale, shear and translation; no local or nonlinear warp',affine:[[a,0,tx],[b,d,ty]],sourceFrontEdgeFits:{left,right},waterEdges,verticalToHorizontalScaleRatio:d/a,rasterFootprintEdges:raster,maxIntroducedLineDeviationPixels:maxIntroducedLineDeviation,verticalsRetainScreenX:true,alphaBorderMax:border,referenceFiles:['scripts/source-art/swimmingPool/v1/geometry-crop.png'],nominalGroundAnchor:P(60,0),limitations:'Generated detail retains small raster differences from the guide. Four independent water edges are measured as well as the outer parcel. Maximum internal-axis slope error is under 0.04; no pixel-exact 50x25m pool is claimed.'};
 if(check){assert.deepEqual(JSON.parse(fs.readFileSync(path.join(ROOT,META))),meta);assert.equal(hash(fs.readFileSync(path.join(ROOT,OUT))),hash(png));}else{fs.mkdirSync(path.dirname(path.join(ROOT,OUT)),{recursive:true});fs.writeFileSync(path.join(ROOT,OUT),png);fs.writeFileSync(path.join(ROOT,META),JSON.stringify(meta,null,2)+'\n');}
 assert.equal(hash(fs.readFileSync(path.join(ROOT,SOURCE))),hash(bytes));
 console.log(JSON.stringify({mode:check?'verified':'prepared',raster,waterEdges,verticalToHorizontalScaleRatio:d/a,maxIntroducedLineDeviationPixels:maxIntroducedLineDeviation,alphaBorderMax:border}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
