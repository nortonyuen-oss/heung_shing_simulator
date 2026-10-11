// Preserve delivered PNGs, clean faint alpha haze and prepare measured spectator sources.
// node scripts/prepare-dragon-boat-crowds.js
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const root=path.resolve(__dirname,'..'),base=path.join(root,'scripts/source-art/festivals');
// Anatomical head-to-foot controls, excluding raised arms; inspected source pixels.
const refs={
 spectatorsBack1:{head:[210,258],foot:[201,836],feet:[[193,843],[370,970],[523,801],[757,876],[588,963],[893,984],[1081,986]]},
 spectatorsFront1:{head:[183,194],foot:[157,884],feet:[[156,880],[343,1064],[483,928],[794,966],[602,1085],[945,1101],[1165,924]]},
 spectatorsBack2:{head:[195,269],foot:[185,884],feet:[[175,885],[363,1040],[534,825],[784,919],[616,1040],[918,1069],[1119,1043]]},
 spectatorsFront2:{head:[222,196],foot:[154,870],feet:[[158,881],[344,1060],[501,937],[798,958],[659,1112],[976,1112],[1167,950]]}
};
(async()=>{
 const geometry={};fs.mkdirSync(path.join(base,'original/DragonBoat'),{recursive:true});
 for(const [name,r] of Object.entries(refs)){
  const original=path.join(base,'original/DragonBoat',name+'.png'),prepared=path.join(base,'DragonBoat',name+'.png');
  if(!fs.existsSync(original))fs.copyFileSync(prepared,original);
  const {data,info}=await sharp(original).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let x0=info.width,y0=info.height,x1=0,y1=0;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const i=(y*info.width+x)*4;if(data[i+3]<=20){data.fill(0,i,i+4);continue;}x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x+1);y1=Math.max(y1,y+1);}
  const w=x1-x0,h=y1-y0,k=Math.min(944/w,944/h),sw=Math.round(w*k),sh=Math.round(h*k),ox=Math.round((1024-sw)/2),oy=1024-40-sh;
  const resized=await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).extract({left:x0,top:y0,width:w,height:h}).resize(sw,sh).png().toBuffer();
  await sharp({create:{width:1024,height:1024,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:resized,left:ox,top:oy}]).png().toFile(prepared);
  const map=p=>[ox+(p[0]-x0)*sw/w,oy+(p[1]-y0)*sh/h],feet=r.feet.map(map);
  geometry[name]={anchor:[0,1].map(i=>feet.reduce((s,p)=>s+p[i],0)/feet.length),personPoints:[map(r.head),map(r.foot)],heightM:1.7,people:7,sourcePersonPoints:[r.head,r.foot],sourceFeet:r.feet,projection:'source preserved; no reliable rectangular ground reference',footprintM:[5,4]};
 }
 fs.writeFileSync(path.join(root,'data/dragon-boat-crowd-geometry.json'),JSON.stringify(geometry,null,2)+'\n');
 console.log('Prepared four 1024px spectator sources; originals preserved.');
})().catch(e=>{console.error(e);process.exitCode=1;});
