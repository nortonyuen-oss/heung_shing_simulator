#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),sharp=require('sharp');
const {lineFit}=require('./prepare-public-market-style.js');
const {P,W,H}=require('./basketball-court-guide.js');
const ROOT=path.resolve(__dirname,'..'),ART='scripts/source-art/basketballCourt/v1',OUT='Models/basketballCourt/bc_estateFullCourt_v1.png';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const lerp=(a,b,t)=>a+(b-a)*t;
// Shape-preserving cubic interpolation avoids creases in painted court arcs.
// Every control point remains exact, and screen X never depends on height.
function spline(points,a,b){
 const v=points.map(p=>[p[a],p[b]]),d=v.slice(1).map((p,i)=>(p[1]-v[i][1])/(p[0]-v[i][0]));
 const m=v.map((p,i)=>{if(!i)return d[0];if(i===v.length-1)return d[d.length-1];const h0=p[0]-v[i-1][0],h1=v[i+1][0]-p[0],w0=2*h1+h0,w1=h1+2*h0;return d[i-1]*d[i]<=0?0:(w0+w1)/(w0/d[i-1]+w1/d[i]);});
 return x=>{let i=0;while(i<v.length-2&&x>v[i+1][0])i++;const h=v[i+1][0]-v[i][0],t=(x-v[i][0])/h;if(t<0)return v[i][1]+(x-v[i][0])*m[i];if(t>1)return v[i+1][1]+(x-v[i+1][0])*m[i+1];return (2*t**3-3*t*t+1)*v[i][1]+(t**3-2*t*t+t)*h*m[i]+(-2*t**3+3*t*t)*v[i+1][1]+(t**3-t*t)*h*m[i+1];};
}
function thinPlate(points){
 const u=r=>r<1e-20?0:r*Math.log(r),n=points.length,N=n+3;
 const a=Array.from({length:N},()=>new Float64Array(N+1));
 for(let i=0;i<n;i++){const p=points[i];for(let j=0;j<n;j++){const q=points[j];a[i][j]=u((p.x-q.x)**2+(p.y-q.y)**2)+(i===j?1e-11:0);}a[i][n]=a[n][i]=1;a[i][n+1]=a[n+1][i]=p.x;a[i][n+2]=a[n+2][i]=p.y;a[i][N]=p.t;}
 for(let k=0;k<N;k++){let pivot=k;for(let i=k+1;i<N;i++)if(Math.abs(a[i][k])>Math.abs(a[pivot][k]))pivot=i;[a[k],a[pivot]]=[a[pivot],a[k]];assert(Math.abs(a[k][k])>1e-15);const d=a[k][k];for(let j=k;j<=N;j++)a[k][j]/=d;for(let i=0;i<N;i++){if(i===k)continue;const q=a[i][k];for(let j=k;j<=N;j++)a[i][j]-=q*a[k][j];}}
 const w=a.map(r=>r[N]);return(x,y)=>{x/=1000;y/=1000;let z=w[n]+w[n+1]*x+w[n+2]*y;for(let i=0;i<n;i++)z+=w[i]*u((x-points[i].x)**2+(y-points[i].y)**2);return z;};
}
async function main(){
 const check=process.argv.includes('--check'),cfg=JSON.parse(fs.readFileSync(path.join(ROOT,ART,'registration.json'))),bytes=fs.readFileSync(path.join(ROOT,cfg.source));
 const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const xs=cfg.anchors.filter(a=>!a.name.startsWith('fence')).map(a=>({s:a.source[0],t:P(...a.world)[0]})).sort((a,b)=>a.s-b.s).filter((a,i,v)=>!i||Math.abs(a.s-v[i-1].s)>1e-6);
 for(let i=1;i<xs.length;i++)assert(xs[i].t>xs[i-1].t,'X registration must preserve verticals without reversing columns');
 const xForward=spline(xs,'s','t');
 function xMap(x,inverse=false){if(!inverse)return xForward(x);let lo=-1000,hi=info.width+1000;for(let i=0;i<40;i++){const m=(lo+hi)/2;if(xForward(m)<x)lo=m;else hi=m;}return (lo+hi)/2;}
 const controls=[];
 for(const [ia,ib]of cfg.segments){const A=cfg.anchors[ia],B=cfg.anchors[ib],ta=P(...A.world),tb=P(...B.world);for(let j=0;j<=32;j++){const f=j/32,x=lerp(A.source[0],B.source[0],f),y=lerp(A.source[1],B.source[1],f),t=lerp(ta[1],tb[1],(xMap(x)-ta[0])/(tb[0]-ta[0]));if(!controls.some(p=>Math.hypot(p.x*1000-x,p.y*1000-y)<.001))controls.push({x:x/1000,y:y/1000,t});}}
 const yForward=thinPlate(controls);
 let maxGroundEdgeError=0;
 for(const [ia,ib]of cfg.segments){const A=cfg.anchors[ia],B=cfg.anchors[ib],ta=P(...A.world),tb=P(...B.world);for(let j=0;j<=100;j++){const f=j/100,x=lerp(A.source[0],B.source[0],f),y=lerp(A.source[1],B.source[1],f),t=lerp(ta[1],tb[1],(xMap(x)-ta[0])/(tb[0]-ta[0]));maxGroundEdgeError=Math.max(maxGroundEdgeError,Math.abs(yForward(x,y)-t));}}
 assert(maxGroundEdgeError<1,`Ground outline registration must stay within one pixel: ${maxGroundEdgeError}`);
 // X depends ONLY on source X. Every originally vertical pole remains vertical.
 const out=Buffer.alloc(W*H*4);
 for(let x=0;x<W;x++){
  const sx=xMap(x,true);if(sx< -1||sx>=info.width)continue;const ix=Math.floor(sx),fx=sx-ix;
  const ys=[];for(let sy=0;sy<=info.height+4;sy+=4){const ty=yForward(sx,sy);if(ys.length)assert(ty>ys[ys.length-1].t,'Smooth warp must not reverse image rows');ys.push({s:sy,t:ty});}let row=0;
  for(let y=0;y<H;y++){
   while(row<ys.length-2&&y>ys[row+1].t)row++;const sy=lerp(ys[row].s,ys[row+1].s,(y-ys[row].t)/(ys[row+1].t-ys[row].t));if(sy< -1||sy>=info.height)continue;const iy=Math.floor(sy),fy=sy-iy;let a=0,r=0,g=0,b=0;
   for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++){const X=ix+xx,Y=iy+yy;if(X<0||Y<0||X>=info.width||Y>=info.height)continue;const p=(Y*info.width+X)*4,w=(xx?fx:1-fx)*(yy?fy:1-fy)*data[p+3];a+=w;r+=data[p]*w;g+=data[p+1]*w;b+=data[p+2]*w;}
   const p=(y*W+x)*4,A=Math.round(a);if(A<=1)continue;out[p]=Math.round(r/a);out[p+1]=Math.round(g/a);out[p+2]=Math.round(b/a);out[p+3]=A;
  }
 }
 const targets=cfg.anchors.map(a=>{const tx=xMap(a.source[0]),ty=yForward(...a.source),p=P(...a.world),error=Math.hypot(tx-p[0],ty-p[1]);if(!a.name.startsWith('fence'))assert(error<.01);return{name:a.name,pixel:[tx,ty],target:p,errorPixels:error};});
 const raster={frontLeft:lineFit(out,W,H,290,740,false),frontRight:lineFit(out,W,H,860,1300,false)};
 assert(Math.abs(raster.frontLeft.slope-0.5)<0.01);assert(Math.abs(raster.frontRight.slope+0.5)<0.01);
 let border=0;for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(x<8||y<8||x>=W-8||y>=H-8)border=Math.max(border,out[(y*W+x)*4+3]);assert.equal(border,0);
 const png=await sharp(out,{raw:{width:W,height:H,channels:4}}).png().toBuffer(),layout=JSON.parse(fs.readFileSync(path.join(ROOT,ART,'layout.json')));
 const meta={version:1,runtimeIntegrated:false,output:OUT,source:cfg.source,sourceSha256:hash(bytes),outputSha256:hash(png),layout,registration:cfg,method:'Monotonic cubic X and smooth thin-plate Y ground registration, preserving screen-vertical props; fence footprint is approximate',verticalsRetainScreenX:true,maxGroundEdgeErrorPixels:maxGroundEdgeError,targetLandmarks:targets,rasterFootprintEdges:raster,alphaBorderMax:border,styleReferences:['Models/publicMarket/pm_market3x3_style_v3.png','Models/government/2x2/primarySchool2-01.png','Models/parks/park2x2/sportField3-02.png']};
 const file=path.join(ROOT,'data/basketball-court-geometry.json');
 if(check){assert.deepEqual(JSON.parse(fs.readFileSync(file)),meta);assert.equal(hash(fs.readFileSync(path.join(ROOT,OUT))),hash(png));}else{fs.writeFileSync(path.join(ROOT,OUT),png);fs.writeFileSync(file,JSON.stringify(meta,null,2)+'\n');}
 assert.equal(hash(fs.readFileSync(path.join(ROOT,cfg.source))),hash(bytes));console.log(JSON.stringify({mode:check?'verified':'prepared',raster,verticalsRetainScreenX:true,registeredGroundLandmarks:targets.length,alphaBorderMax:border}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
