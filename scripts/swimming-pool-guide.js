#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),sharp=require('sharp');
const ROOT=path.resolve(__dirname,'..'),ART=path.join(ROOT,'scripts/source-art/swimmingPool/v1');
const W=1600,H=1400,P=(x,y,z=0)=>[200+10*(x+y),800+5*(x-y)-20*z];
const pts=a=>a.map(p=>P(...p).join(',')).join(' ');
const poly=(a,fill,stroke='none',width=.7)=>`<polygon points="${pts(a)}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"/>`;
const rect=(x,y,w,d,fill,z=0,stroke='none',width=.7)=>poly([[x,y,z],[x+w,y,z],[x+w,y+d,z],[x,y+d,z]],fill,stroke,width);
const line=(a,b,color='#677f73',width=1)=>`<polyline points="${pts([a,b])}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
function grid(){let s=rect(0,0,60,60,'none',0,'#979d9d',.65);for(const t of [20,40])s+=line([t,0],[t,60],'#979d9d',.5)+line([0,t],[60,t],'#979d9d',.5);return s;}
function pool(){
 let s=rect(2,22,56,31,'#e2ded0')+rect(4.6,24.6,50.8,25.8,'#f5f1dc')+rect(5,25,50,25,'#63c4d4',-.12,'#699fa4',1);
 for(let i=0;i<8;i++){const y=28.75+i*2.5;s+=line([7,y,-.15],[53,y,-.15],'#267e9b',1.7)+line([7,y-.6,-.15],[7,y+.6,-.15],'#267e9b',1.7)+line([53,y-.6,-.15],[53,y+.6,-.15],'#267e9b',1.7);s+=rect(4.2,y-.35,.65,.7,'#e9ebdf',.5,'#5c959a',.8);}
 for(let i=0;i<=8;i++){const y=27.5+i*2.5;s+=line([5,y,.02],[55,y,.02],'#e4e6d9',1.6)+line([5,y,.02],[10,y,.02],'#bd6850',1.8)+line([50,y,.02],[55,y,.02],'#bd6850',1.8);}
 return s;
}
function building(){
 let s=poly([[8,5,0],[45,5,0],[45,5,3.7],[8,5,3.7]],'#d9d5ba','#9b9d8c')+poly([[45,5,0],[45,14,0],[45,14,3.7],[45,5,3.7]],'#b9c5ad','#9b9d8c');
 for(const x of [11,17,34,40])s+=poly([[x,5,1.2],[x+2.8,5,1.2],[x+2.8,5,2.5],[x,5,2.5]],'#687e74','#9ca98d');
 s+=poly([[24,5,.1],[29,5,.1],[29,5,2.8],[24,5,2.8]],'#5f8177','#9ca98d');
 s+=rect(7.7,4.7,37.6,9.6,'#93a68c',3.8,'#697e72',1)+rect(8.3,5.3,36.4,8.4,'#cecebb',3.85,'#9b9d8c',.6);
 s+=rect(48,6,7,7,'#b8bca7',3,'#7d8b7b',.8);
 return s;
}
function fence(x1,y1,x2,y2){let s='',n=Math.ceil(Math.hypot(x2-x1,y2-y1)/3);for(let i=0;i<=n;i++){const f=i/n,x=x1+(x2-x1)*f,y=y1+(y2-y1)*f;s+=line([x,y,0],[x,y,1.65],'#567a68',1.15);}for(const z of [.2,1.65])s+=line([x1,y1,z],[x2,y2,z],'#567a68',1.15);return s;}
function chair(x,y){let s='';for(const xx of [x-.35,x+.35])for(const yy of [y-.35,y+.35])s+=line([xx,yy,0],[xx,yy,1.8],'#8a9991',1.4);s+=rect(x-.4,y-.4,.8,.8,'#e9e4c9',1.8,'#8a9991');s+=line([x-.4,y+.4,1.8],[x-.4,y+.4,2.45],'#8a9991',1.3)+line([x+.4,y+.4,1.8],[x+.4,y+.4,2.45],'#8a9991',1.3)+line([x-.4,y+.4,2.45],[x+.4,y+.4,2.45],'#8a9991',1.3);return s;}
function props(){let s='';for(const [x,y]of [[3,18],[57,18],[3,56],[57,56]])s+=line([x,y,0],[x,y,5.5],'#788c81',2.4)+rect(x,y-.3,1,.6,'#dde1d7',5.5,'#788c81',.8);s+=chair(21,20)+chair(40,55);for(const [x,y]of [[15,18],[36,18],[20,56],[39,56]])s+=rect(x,y,3,.7,'#ae9773',.5,'#6a8775',.7);for(const [x,y]of [[3.5,5],[55.5,5]]){s+=rect(x-1.8,y-1.5,3.6,3,'#b7bba2',.25,'#9aa58a');s+=line([x,y,.25],[x,y,3.7],'#94866a',3);const [a,b]=P(x,y,4);s+=`<ellipse cx="${a}" cy="${b}" rx="38" ry="32" fill="#88a676" stroke="#779566" stroke-width=".6"/>`;}return s;}
async function main(){
 fs.mkdirSync(ART,{recursive:true});
 const wrap=s=>`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#fafaf7"/>${s}</svg>`;
 const base=rect(0,0,60,60,'#dad8c9',0,'#a4ab99',.75);
 const layout=base+pool()+rect(8,5,37,9,'#b6bea6')+rect(48,6,7,7,'#a7b59c')+grid();
 const model=base+fence(1,1,1,59)+fence(1,59,59,59)+pool()+building()+props()+fence(59,1,59,59)+fence(1,1,20,1)+fence(26,1,59,1);
 for(const [name,s]of [['01-grid',grid()],['02-layout',layout],['03-construction-guide',model]]){const svg=wrap(s);fs.writeFileSync(path.join(ART,name+'.svg'),svg);await sharp(Buffer.from(svg)).png().toFile(path.join(ART,name+'.png'));}
 const corners=[[0,0],[60,0],[60,60],[0,60]].map(p=>P(...p));for(let i=0;i<4;i++)assert.equal(Math.abs((corners[(i+1)%4][1]-corners[i][1])/(corners[(i+1)%4][0]-corners[i][0])),.5);
 const meta={version:1,tiles:[3,3],tileMetres:20,siteMetres:[60,60],canvas:[W,H],projection:'screenX=200+10*(x+y); screenY=800+5*(x-y)-20*z',siteCorners:corners,pool:{origin:[5,25],length:50,width:25,lanes:8,boundaryCorners:[[5,25],[55,25],[55,50],[5,50]].map(p=>P(...p))},deck:{origin:[2,22],length:56,width:31},amenityBuilding:{origin:[8,5],length:37,width:9,height:3.8},plantBuilding:{origin:[48,6],length:7,width:7},design:'Simple Hong Kong outdoor municipal pool: one main pool, low amenity building, plant room and sparse poolside furnishings',runtimeIntegrated:false,calibrationPolicy:'Only global affine correction is allowed for generated artwork. No local nonlinear warps.'};
 fs.writeFileSync(path.join(ART,'layout.json'),JSON.stringify(meta,null,2)+'\n');console.log('Saved exact 3x3 grid, single-pool layout and construction guide.');
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={P,W,H};
