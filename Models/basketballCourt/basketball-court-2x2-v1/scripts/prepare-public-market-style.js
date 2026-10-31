#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),sharp=require('sharp');
const ROOT=path.resolve(__dirname,'..'),ART='scripts/source-art/publicMarket/style-v3',OUTPUT='Models/publicMarket/pm_market3x3_style_v3.png';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const area=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function circumcircle(a,b,c){
 const d=2*(a[0]*(b[1]-c[1])+b[0]*(c[1]-a[1])+c[0]*(a[1]-b[1]));if(Math.abs(d)<1e-8)return null;
 const A=a[0]**2+a[1]**2,B=b[0]**2+b[1]**2,C=c[0]**2+c[1]**2;
 const x=(A*(b[1]-c[1])+B*(c[1]-a[1])+C*(a[1]-b[1]))/d,y=(A*(c[0]-b[0])+B*(a[0]-c[0])+C*(b[0]-a[0]))/d;
 return{x,y,r2:(x-a[0])**2+(y-a[1])**2};
}
function triangulate(input){
 const points=[...input,[-100000,-100000],[100000,-100000],[0,100000]],n=input.length;let tris=[[n,n+1,n+2]];
 for(let i=0;i<n;i++){
  const bad=[],edges=new Map();
  for(let j=0;j<tris.length;j++){const t=tris[j],c=circumcircle(...t.map(k=>points[k]));if(c&&(points[i][0]-c.x)**2+(points[i][1]-c.y)**2<=c.r2+1e-5){bad.push(j);for(let e=0;e<3;e++){const a=t[e],b=t[(e+1)%3],key=[a,b].sort((x,y)=>x-y).join(':');if(edges.has(key))edges.delete(key);else edges.set(key,[a,b]);}}}
  const removed=new Set(bad);tris=tris.filter((_,j)=>!removed.has(j));for(const e of edges.values())if(Math.abs(area(points[e[0]],points[e[1]],points[i]))>1e-7)tris.push([...e,i]);
 }
 return tris.filter(t=>t.every(i=>i<n));
}
function lineFit(raw,w,h,x0,x1,top){let n=0,sx=0,sy=0,sxx=0,sxy=0;for(let x=x0;x<x1;x++){let y=top?0:h-1;while(y>=0&&y<h&&raw[(y*w+x)*4+3]<200)y+=top?1:-1;if(y<0||y>=h)continue;n++;sx+=x;sy+=y;sxx+=x*x;sxy+=x*y;}const m=(n*sxy-sx*sy)/(n*sxx-sx*sx);return{slope:m,intercept:(sy-m*sx)/n};}
async function main(){
 const check=process.argv.includes('--check'),config=JSON.parse(fs.readFileSync(path.join(ROOT,ART,'registration.json'))),bytes=fs.readFileSync(path.join(ROOT,config.source));
 const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true}),[W,H]=config.canvas,points=[];
 const add=(s,t)=>{const old=points.findIndex(p=>Math.hypot(p.s[0]-s[0],p.s[1]-s[1])<1e-6);if(old>=0){assert(Math.hypot(points[old].t[0]-t[0],points[old].t[1]-t[1])<1e-5);return old;}points.push({s,t});return points.length-1;};
 const anchors=config.anchors.map(a=>add(a.source,a.target));
 const edges=[[0,1],[1,2],[2,3],[3,0],[0,4],[1,5],[2,6],[4,5],[5,6],[7,8],[8,9]];
 const required=[];
 for(const [a,b]of edges){let previous=anchors[a];for(let k=1;k<=12;k++){const f=k/12,s=config.anchors[a].source.map((v,j)=>v+(config.anchors[b].source[j]-v)*f),t=config.anchors[a].target.map((v,j)=>v+(config.anchors[b].target[j]-v)*f),next=add(s,t);required.push([previous,next]);previous=next;}}
 for(const [s,t]of [[[-2,-2],[175,170]],[[info.width+2,-2],[1425,170]],[[info.width+2,info.height+2],[1425,1160]],[[-2,info.height+2],[175,1160]]])add(s,t);
 const triangles=triangulate(points.map(p=>p.s)),edgeSet=new Set();
 for(const tri of triangles)for(let e=0;e<3;e++)edgeSet.add([tri[e],tri[(e+1)%3]].sort((a,b)=>a-b).join(':'));
 for(const edge of required)assert(edgeSet.has(edge.sort((a,b)=>a-b).join(':')),'A locked architectural edge is missing from registration mesh');
 const out=Buffer.alloc(W*H*4);
 for(const ids of triangles){
  const S=ids.map(i=>points[i].s),T=ids.map(i=>points[i].t),den=area(...T);assert(area(...S)*den>0,'Registration folds a triangle');
  const left=Math.max(0,Math.floor(Math.min(...T.map(p=>p[0])))),right=Math.min(W-1,Math.ceil(Math.max(...T.map(p=>p[0])))),top=Math.max(0,Math.floor(Math.min(...T.map(p=>p[1])))),bottom=Math.min(H-1,Math.ceil(Math.max(...T.map(p=>p[1]))));
  for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
   const q=[x,y],u=area(q,T[1],T[2])/den,v=area(T[0],q,T[2])/den,z=1-u-v;if(u< -1e-7||v< -1e-7||z< -1e-7)continue;
   const sx=u*S[0][0]+v*S[1][0]+z*S[2][0],sy=u*S[0][1]+v*S[1][1]+z*S[2][1],ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy;let a=0,r=0,g=0,b=0;
   for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++){const X=ix+xx,Y=iy+yy;if(X<0||Y<0||X>=info.width||Y>=info.height)continue;const p=(Y*info.width+X)*4,w=(xx?fx:1-fx)*(yy?fy:1-fy)*data[p+3];a+=w;r+=data[p]*w;g+=data[p+1]*w;b+=data[p+2]*w;}
   const alpha=Math.round(a),p=(y*W+x)*4;if(alpha<=1){out.fill(0,p,p+4);continue;}out[p]=Math.round(r/a);out[p+1]=Math.round(g/a);out[p+2]=Math.round(b/a);out[p+3]=alpha;
  }
 }
 const png=await sharp(out,{raw:{width:W,height:H,channels:4}}).png().toBuffer();
 const raster={groundLeft:lineFit(out,W,H,240,740,false),groundRight:lineFit(out,W,H,870,1350,false),roofBackLeft:lineFit(out,W,H,450,740,true),roofBackRight:lineFit(out,W,H,830,1150,true)};
 for(const [key,target]of [['groundLeft',0.5],['groundRight',-0.5],['roofBackLeft',-0.5],['roofBackRight',0.5]])assert(Math.abs(raster[key].slope-target)<0.01,`${key} raster slope failed: ${raster[key].slope}`);
 let edgeAlpha=0;for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(x<8||y<8||x>=W-8||y>=H-8)edgeAlpha=Math.max(edgeAlpha,out[(y*W+x)*4+3]);assert.equal(edgeAlpha,0);
 const meta={version:3,runtimeIntegrated:false,source:config.source,sourceSha256:hash(bytes),output:OUTPUT,outputSha256:hash(png),canvas:[W,H],siteMetres:[60,60],tiles:[3,3],method:'imagegen style edit using existing game references; piecewise affine landmark registration to approved ground, wall and roof axes',registration:config,mesh:{points:points.length,triangles:triangles.length,allArchitecturalEdgesLocked:true,noFoldedTriangles:true},rasterEdgeFit:raster,borderMaxAlpha:edgeAlpha,styleReferences:['Models/government/2x2/library2-01.png','Models/government/2x2/primarySchool2-01.png','Models/specialSites/1x1/fishMarket1-02_day.png']};
 const file='data/public-market-style-v3.json';
 if(check){assert.deepEqual(JSON.parse(fs.readFileSync(path.join(ROOT,file))),meta);assert.equal(hash(fs.readFileSync(path.join(ROOT,OUTPUT))),hash(png));}else{fs.writeFileSync(path.join(ROOT,OUTPUT),png);fs.writeFileSync(path.join(ROOT,file),JSON.stringify(meta,null,2)+'\n');}
 assert.equal(hash(fs.readFileSync(path.join(ROOT,config.source))),hash(bytes));
 console.log(JSON.stringify({mode:check?'verified':'prepared',raster,mesh:meta.mesh,borderMaxAlpha:edgeAlpha}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={triangulate,area,lineFit};
