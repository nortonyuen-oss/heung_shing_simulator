// Deterministic extraction/packing, using the same component isolation as festival props.
// Source poses cross nominal 256px cell boundaries: never crop by grid alone.
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const {loadRaw,labelComponents,cutPart,mirrorRGBA}=require('./lib/sheet-parts');
const root=path.resolve(__dirname,'..');
const controls=require('./source-art/festivals/bunHill/climber-controls.json');
const dir='Models/festivals/bunHillClimbers';
(async()=>{
 const img=await loadRaw(path.join(root,controls.source)),components=labelComponents(img);
 const people=components.bounds.filter(b=>b&&b.maxY-b.minY>100&&b.maxX-b.minX>35);
 if(people.length!==24)throw Error(`expected 24 people, found ${people.length}`);
 fs.mkdirSync(path.join(root,dir),{recursive:true});
 const atlas=Buffer.alloc(2048*2048*4),frames={};let index=0;
 for(let row=0;row<4;row++)for(let col=0;col<6;col++){
  const ref=controls.rows[row],pose=controls.poses[col];
  const person=people.find(b=>Math.floor((b.minX+b.maxX)/2/256)===col&&Math.floor((b.minY+b.maxY)/2/256)===row);
  if(!person)throw Error(`missing row ${row} col ${col}`);
  const rect=[person.minX-2,person.minY-2,person.maxX-person.minX+5,person.maxY-person.minY+5];
  const cut=cutPart(img,components,rect);
  // cutPart includes tolerance outside rect, clamped at image boundaries.
  const left=Math.max(0,rect[0]-4),top=Math.max(0,rect[1]-4);
  for(let i=0;i<cut.data.length;i+=4)if(cut.data[i+3]<=10)cut.data.fill(0,i,i+4);
  const sourceHeightPx=ref.feet[1]-ref.head[1],k=128/sourceHeightPx;
  const sw=Math.round(cut.width*k),sh=Math.round(cut.height*k),sx=sw/cut.width,sy=sh/cut.height;
  const hip=ref.hips[col],ox=Math.round(128-(hip[0]-left)*sx),oy=Math.round(128-(hip[1]-top)*sy);
  if(ox<8||oy<8||ox+sw>248||oy+sh>248)throw Error(`frame clips: ${row}:${col}`);
  const scaled=await sharp(cut.data,{raw:{width:cut.width,height:cut.height,channels:4}}).resize(sw,sh).raw().toBuffer();
  const packed=Buffer.alloc(256*256*4);
  for(let y=0;y<sh;y++)scaled.copy(packed,((oy+y)*256+ox)*4,y*sw*4,(y+1)*sw*4);
  const map=p=>[ox+(p[0]-left)*sx,oy+(p[1]-top)*sy];
  const ground=pose==='grounded'?ref.groundedFeet:ref.feet;
  for(const mirrored of [false,true]){
   const key=`${ref.gender}_${ref.view}_${pose}${mirrored?'_m':''}`;
   const data=mirrored?mirrorRGBA(packed,256,256):packed;
   const flip=p=>mirrored?[256-p[0],p[1]]:p;
   const ax=index%8*256,ay=Math.floor(index/8)*256;
   for(let y=0;y<256;y++)data.copy(atlas,((ay+y)*2048+ax)*4,y*256*4,(y+1)*256*4);
   const file=`${dir}/${key}.png`;
   await sharp(data,{raw:{width:256,height:256,channels:4}}).png().toFile(path.join(root,file));
   frames[key]={file,gender:ref.gender,view:ref.view,pose,mirrored,rect:[ax,ay,256,256],
    anchor:flip([128,128]),groundAnchor:flip(map(ground)),heightM:controls.heightM,
    personHeightPx:sourceHeightPx*sy,hipHeightM:(ref.feet[1]-ref.hips[0][1])/sourceHeightPx*controls.heightM,
    sourceBounds:[person.minX,person.minY,person.maxX+1,person.maxY+1],sourceHip:hip,sourcePersonPoints:[ref.head,ref.feet]};
   index++;
  }
 }
 const file=`${dir}/atlas.png`;
 await sharp(atlas,{raw:{width:2048,height:2048,channels:4}}).png().toFile(path.join(root,file));
 fs.writeFileSync(path.join(root,'data/bun-hill-climbers.json'),JSON.stringify({version:1,source:controls.source,
  atlas:{file,width:2048,height:2048,frameWidth:256,frameHeight:256},frames},null,2)+'\n');
 console.log('Baked 24 calibrated poses, 24 mirrors and one 2048x2048 atlas.');
})().catch(error=>{console.error(error);process.exitCode=1;});
