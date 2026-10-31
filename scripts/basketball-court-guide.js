#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..'),ART=path.join(ROOT,'scripts/source-art/basketballCourt/v1');
const W=1600,H=1400;
const P=(x,y,z=0)=>[240+14*(x+y),800+7*(x-y)-28*z];
const points=a=>a.map(p=>P(...p).join(',')).join(' ');
const poly=(a,fill,stroke='#788f80',width=0.65)=>`<polygon points="${points(a)}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"/>`;
const rect=(x,y,w,d,fill,z=0,stroke='none',width=0.65)=>poly([[x,y,z],[x+w,y,z],[x+w,y+d,z],[x,y+d,z]],fill,stroke,width);
const ln=(a,b,c='#f5f2df',w=1)=>`<polyline points="${points([a,b])}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
const curve=(a,c='#f5f2df',w=1,dash='')=>`<polyline points="${points(a)}" fill="none" stroke="${c}" stroke-width="${w}" ${dash?`stroke-dasharray="${dash}"`:''}/>`;
const arc=(x,y,r,t0,t1,flip=1)=>Array.from({length:101},(_,i)=>{const t=t0+(t1-t0)*i/100;return[x+flip*r*Math.cos(t),y+r*Math.sin(t),0.02];});
function grid(){return rect(0,0,40,40,'none',0,'#979d9d',0.7)+ln([20,0],[20,40],'#979d9d',0.55)+ln([0,20],[40,20],'#979d9d',0.55);}
function court(){
 let s=rect(4,10.5,32,19,'#a16955')+rect(6,12.5,28,15,'#528271');
 for(const [base,ft,hx,flip] of [[6,11.8,7.575,1],[34,28.2,32.425,-1]]){
  s+=rect(Math.min(base,ft),17.55,5.8,4.9,'#91afa0');
  const cx=base===6?6:28.2;s+=rect(cx,17.55,5.8,4.9,'none',0.02,'#f5f2df',1);
  s+=curve(arc(ft,20,1.8,-Math.PI/2,Math.PI/2,flip));
  s+=curve(arc(ft,20,1.8,Math.PI/2,Math.PI*1.5,flip),'#f5f2df',0.85,'2 3');
  const t=Math.asin(6.6/6.75),join=hx+flip*Math.sqrt(6.75**2-6.6**2);
  s+=curve(arc(hx,20,6.75,-t,t,flip))+ln([base,13.4,0.02],[join,13.4,0.02])+ln([base,26.6,0.02],[join,26.6,0.02]);
  s+=curve(arc(hx,20,1.3,-Math.PI/2,Math.PI/2,flip),'#f5f2df',0.85);
 }
 s+=rect(6,12.5,28,15,'none',0.02,'#f5f2df',1)+ln([20,12.35,0.02],[20,27.65,0.02]);
 s+=curve(arc(20,20,1.8,0,Math.PI*2));return s;
}
function hoop(left){
 const px=left?3.2:36.8,bx=left?7.2:32.8,hx=left?7.575:32.425;
 let s=rect(px-0.5,19.55,1,0.9,'#6a8277');
 s+=ln([px,20,0],[px,20,3.1],'#4d6c61',5)+ln([px,20,3.1],[bx,20,3.3],'#4d6c61',4);
 s+=poly([[bx,19.1,2.9],[bx,20.9,2.9],[bx,20.9,3.95],[bx,19.1,3.95]],'#ebece2','#69877a',1.4);
 s+=poly([[bx,19.705,3.05],[bx,20.295,3.05],[bx,20.295,3.5],[bx,19.705,3.5]],'none','#8b4f3f',1);
 s+=curve(arc(hx,20,0.225,0,Math.PI*2).map(([x,y])=>[x,y,3.05]),'#aa613e',1.8);
 for(const t of [0,1,2,3,4,5]){const a=t*Math.PI/3;s+=ln([hx+0.225*Math.cos(a),20+0.225*Math.sin(a),3.05],[hx+0.13*Math.cos(a),20+0.13*Math.sin(a),2.65],'#d5dad0',0.6);}
 return s;
}
function fence(x1,y1,x2,y2,h=3.5){
 let s='',L=Math.hypot(x2-x1,y2-y1),n=Math.ceil(L/3);
 for(let i=0;i<=n;i++){const f=i/n,x=x1+(x2-x1)*f,y=y1+(y2-y1)*f;s+=ln([x,y,0],[x,y,h],'#567567',1.6);}
 s+=ln([x1,y1,h],[x2,y2,h],'#567567',1.2)+ln([x1,y1,0.2],[x2,y2,0.2],'#567567',1.1);
 // Light, see-through wire mesh; no opaque fence walls.
 for(let z=0.4;z<h;z+=0.35)s+=ln([x1,y1,z],[x2,y2,z],'#7e96894d',0.45);
 for(let t=0.4;t<L;t+=0.4){const f=t/L,x=x1+(x2-x1)*f,y=y1+(y2-y1)*f;s+=ln([x,y,0.2],[x,y,h],'#7e96894d',0.45);}
 return s;
}
function furnishings(){
 let s='';
 for(const [x,y]of [[3,6],[37,6],[3,34],[37,34]]){
  s+=ln([x,y,0],[x,y,7],'#798a80',2.7)+ln([x,y,7],[x+0.8,y,7],'#798a80',2.1);
  s+=rect(x+0.25,y-0.3,1.1,0.6,'#d8dcd2',7,'#7e8a80',0.9);
 }
 for(const [x,y]of [[10,5],[24,5],[12,35],[25,35]]){
  s+=rect(x,y,3,0.7,'#a99270',0.45,'#7d8c79',0.7);
  s+=ln([x,y+0.6,0.5],[x,y+0.6,1],'#74836f',1)+ln([x+3,y+0.6,0.5],[x+3,y+0.6,1],'#74836f',1);
  s+=poly([[x,y+0.6,0.75],[x+3,y+0.6,0.75],[x+3,y+0.6,1.0],[x,y+0.6,1.0]],'#ad956e');
 }
 for(const [x,y]of [[6,3],[34,37]]){
  s+=rect(x-2,y-1.4,4,2.8,'#8ca479',0,'#b6b9a6',0.8);
  s+=ln([x,y,0],[x,y,4],'#8f896f',4);const [a,b]=P(x,y,4.5);
  s+=`<ellipse cx="${a}" cy="${b}" rx="55" ry="44" fill="#93aa7c" stroke="#7a956a" stroke-width="0.7"/>`;
 }
 s+=rect(17,4,0.6,0.6,'#567a60',0.9);return s;
}
async function main(){
 fs.mkdirSync(ART,{recursive:true});
 const wrap=body=>`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#fafaf7"/>${body}</svg>`;
 const base=rect(0,0,40,40,'#deded1'),layout=base+rect(2,9,36,22,'#c9c8b7')+court()+grid();
 let model=base+fence(2,31,38,31)+fence(2,9,2,31)+court()+hoop(true)+hoop(false);
 model+=fence(38,9,38,31)+fence(2,9,18,9)+fence(22,9,38,9)+furnishings();
 for(const[name,body]of [['01-grid',grid()],['02-layout',layout],['03-construction-guide',model]]){const svg=wrap(body);fs.writeFileSync(path.join(ART,name+'.svg'),svg);await sharp(Buffer.from(svg)).png().toFile(path.join(ART,name+'.png'));}
 const corners=[[0,0],[40,0],[40,40],[0,40]].map(p=>P(...p));for(let i=0;i<4;i++)assert.equal(Math.abs((corners[(i+1)%4][1]-corners[i][1])/(corners[(i+1)%4][0]-corners[i][0])),0.5);
 const meta={version:1,siteMetres:[40,40],tiles:[2,2],tileMetres:20,canvas:[W,H],projection:'screenX=240+14*(x+y); screenY=800+7*(x-y)-28*z',siteCorners:corners,court:{origin:[6,12.5],length:28,width:15,boundaryCorners:[[6,12.5],[34,12.5],[34,27.5],[6,27.5]].map(p=>P(...p))},clearFloor:{origin:[4,10.5],length:32,width:19},fence:{origin:[2,9],length:36,width:22,height:3.5,frontGateX:[18,22]},hoopCentres:[[7.575,20,3.05],[32.425,20,3.05]],hoopPostBases:[[3.2,20,0],[36.8,20,0]],lightBases:[[3,6],[37,6],[3,34],[37,34]],runtimeIntegrated:false,design:'Traditional Hong Kong housing-estate court, dark green fence, green playing surface and red runoff; props outside clear floor',sources:['https://assets.fiba.basketball/image/upload/documents-corporate-fiba-official-rules-2024-v10a.pdf','https://www.venueguide.fiba.basketball/vanue-design']};
 fs.writeFileSync(path.join(ART,'layout.json'),JSON.stringify(meta,null,2)+'\n');console.log('Built exact 2×2 grid and 28×15 m court guide with 32×19 m clear floor; axes +/-0.5.');
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={P,W,H,court,grid};
