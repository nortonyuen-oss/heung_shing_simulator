#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),sharp=require('sharp');
const {lineFit}=require('./prepare-public-market-style.js');
const {P,W,H}=require('./swimming-pool-guide.js');
const ROOT=path.resolve(__dirname,'..'),ART='scripts/source-art/swimmingPool/v1',SOURCE=ART+'/render-roof-corrected.png',OUT='Models/swimmingPool/sp_simple3x3_v1.png',META='data/swimming-pool-geometry-v1.json';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function main(){
 const check=process.argv.includes('--check'),bytes=fs.readFileSync(path.join(ROOT,SOURCE)),original=fs.readFileSync(path.join(ROOT,ART,'render-source.png'));
 const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const left=lineFit(data,info.width,info.height,90,600,false),right=lineFit(data,info.width,info.height,760,1260,false);
 const front=[(right.intercept-left.intercept)/(left.slope-right.slope),0];front[1]=left.slope*front[0]+left.intercept;
 const a=1200/(1319-27),d=a/(left.slope-right.slope),b=a/2-d*left.slope,tx=200-a*27,ty=1100-b*front[0]-d*front[1];
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
 const raster={frontLeft:lineFit(out,W,H,270,730,false),frontRight:lineFit(out,W,H,870,1320,false)};
 assert(Math.abs(raster.frontLeft.slope-.5)<.002);assert(Math.abs(raster.frontRight.slope+.5)<.002);
 let border=0;for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(x<8||y<8||x>=W-8||y>=H-8)border=Math.max(border,out[(y*W+x)*4+3]);assert.equal(border,0);
 const png=await sharp(out,{raw:{width:W,height:H,channels:4}}).png().toBuffer(),layout=JSON.parse(fs.readFileSync(path.join(ROOT,ART,'layout.json')));
 const meta={version:1,source:SOURCE,sourceSha256:hash(bytes),firstGenerationSha256:hash(original),output:OUT,outputSha256:hash(png),canvas:[W,H],layout,runtimeIntegrated:false,generationMode:'built-in image_gen, then targeted roof-prop correction',method:'Single global affine scale, shear and translation; no local or nonlinear warp',affine:[[a,0,tx],[b,d,ty]],sourceFrontEdgeFits:{left,right},rasterFootprintEdges:raster,maxIntroducedLineDeviationPixels:maxIntroducedLineDeviation,verticalsRetainScreenX:true,alphaBorderMax:border,referenceFiles:['Models/publicMarket/pm_market3x3_style_v3.png','Models/basketballCourt/bc_estateFullCourt_v2.png'],nominalGroundAnchor:P(60,0),limitations:'The exact guide defines the 60x60 m site and 50x25 m pool. Generated internal proportions and individual edge angles may differ slightly. Only the two front footprint axes are calibrated to +/-0.5; all source straight lines remain straight, without claiming pixel-exact agreement of every pool, roof or fence edge with the guide.'};
 if(check){assert.deepEqual(JSON.parse(fs.readFileSync(path.join(ROOT,META))),meta);assert.equal(hash(fs.readFileSync(path.join(ROOT,OUT))),hash(png));}else{fs.mkdirSync(path.dirname(path.join(ROOT,OUT)),{recursive:true});fs.writeFileSync(path.join(ROOT,OUT),png);fs.writeFileSync(path.join(ROOT,META),JSON.stringify(meta,null,2)+'\n');}
 assert.equal(hash(fs.readFileSync(path.join(ROOT,SOURCE))),hash(bytes));assert.equal(hash(fs.readFileSync(path.join(ROOT,ART,'render-source.png'))),hash(original));
 console.log(JSON.stringify({mode:check?'verified':'prepared',raster,maxIntroducedLineDeviationPixels:maxIntroducedLineDeviation,alphaBorderMax:border}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
