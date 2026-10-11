// Shared calibrated character playback for the game test panel and design preview.
// Rendering reads the deterministic contest; it never changes scores or city state.
function getBunHillClimberAnimationPose(person,time,rotation=0,contestant=null) {
  const angle=(person.sector%12)*Math.PI/6-rotation*Math.PI/2;
  const view=Math.cos(angle)<0?'NE':'NW';
  let pose;
  if(person.pose==='waiting')pose='waiting';
  else if(person.pose==='grounded')pose='grounded';
  else if(person.pose==='descending')pose='descend';
  else if(person.pose==='collecting') {
    const events=contestant?.events||[];
    const last=events.findLast(e=>e.at<=time);
    pose=last&&time-last.at<.35?'collect':'climbA';
  } else pose=Math.floor((time+person.sector*.11)/.55)%2?'climbB':'climbA';
  return {key:`${person.gender}_${view}_${pose}`,pose,view,angle,behind:Math.sin(angle)<-1e-8,
    onGround:pose==='waiting'||pose==='grounded'};
}
async function loadBunHillClimberAnimationAssets(prefix='',embeddedMetadata=null) {
  let metadata=embeddedMetadata;
  if(!metadata) {
    const response=await fetch(prefix+'data/bun-hill-climbers.json');
    if(!response.ok)throw Error('無法載入搶包山選手資料');
    metadata=await response.json();
  }
  const images=new Map();
  await Promise.all(Object.entries(metadata.frames).filter(([,frame])=>!frame.mirrored).map(([key,frame])=>new Promise((resolve,reject)=>{
    const image=new Image();
    image.onload=()=>{images.set(key,image);resolve();};
    image.onerror=()=>reject(Error(`無法載入選手 ${key}`));
    image.src=typeof resolveModelAssetPath==='function'?resolveModelAssetPath(frame.file):prefix+frame.file;
  })));
  return {metadata,images};
}
function drawBunHillClimberSprite(ctx,assets,person,time,x,feetY,pixelsPerMetre,rotation=0,contestant=null) {
  const selected=getBunHillClimberAnimationPose(person,time,rotation,contestant);
  const frame=assets.metadata.frames[selected.key],image=assets.images.get(selected.key);
  if(!frame||!image)return null;
  const mapping=typeof getModelTexturePixelMapping==='function'?getModelTexturePixelMapping(frame.file,image):{resize:1,offsetX:0,offsetY:0};
  const scale=frame.heightM*pixelsPerMetre/(frame.personHeightPx*mapping.resize);
  const anchor=selected.onGround?frame.groundAnchor:frame.anchor;
  const ax=anchor[0]*mapping.resize+mapping.offsetX,ay=anchor[1]*mapping.resize+mapping.offsetY;
  const y=feetY-(selected.onGround?0:frame.hipHeightM*pixelsPerMetre);
  ctx.drawImage(image,x-ax*scale,y-ay*scale,image.width*scale,image.height*scale);
  return {x:x+(frame.anchor[0]*mapping.resize+mapping.offsetX-ax)*scale,
    y:y+(frame.anchor[1]*mapping.resize+mapping.offsetY-ay)*scale,selected,scale};
}
function drawBunHillAnimatedContest(ctx,assets,contest,frame,rotation=0) {
  const width=ctx.canvas.width,height=ctx.canvas.height,cx=width/2,base=height-65,up=20,top=base-14*up;
  ctx.clearRect(0,0,width,height);ctx.font='12px system-ui';
  ctx.fillStyle='#8a453d';ctx.beginPath();ctx.ellipse(cx,base,90,45,0,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#9eaec0';ctx.lineWidth=1;
  for(let z=0;z<=14;z+=2){const y=base-z*up;ctx.beginPath();ctx.moveTo(cx-145,y);ctx.lineTo(cx-120,y);ctx.stroke();ctx.fillStyle='#9eaec0';ctx.fillText(z+'m',cx-175,y+4);}
  const people=frame.contestants.map(person=>({person,animation:getBunHillClimberAnimationPose(person,frame.time,rotation,contest.contestants.find(c=>c.id===person.id))}));
  const draw=({person,animation})=>{
    const radius=animation.onGround?65:30;
    const x=cx+Math.cos(animation.angle)*radius,y=base+Math.sin(animation.angle)*radius/2-person.heightM*up;
    // Rope terminates at the calibrated waist harness, rather than a head or shoe.
    const meta=assets.metadata.frames[animation.key];
    const harnessY=y-meta.hipHeightM*up;
    ctx.strokeStyle='rgba(186,201,209,.45)';ctx.beginPath();ctx.moveTo(cx+Math.cos(animation.angle)*30,top+Math.sin(animation.angle)*15);ctx.lineTo(x,harnessY);ctx.stroke();
    const at=drawBunHillClimberSprite(ctx,assets,person,frame.time,x,y,up,rotation,contest.contestants.find(c=>c.id===person.id));
    if(at){ctx.fillStyle=person.dq?'#ff817a':'#edf5ff';ctx.fillText(String(person.sector+1),at.x+9,at.y-9);}
  };
  people.filter(p=>p.animation.behind&&!p.animation.onGround).sort((a,b)=>Math.sin(a.animation.angle)-Math.sin(b.animation.angle)).forEach(draw);
  const gradient=ctx.createLinearGradient(cx-30,0,cx+30,0);gradient.addColorStop(0,'#a98561');gradient.addColorStop(.45,'#f4e3b7');gradient.addColorStop(1,'#bb9870');
  ctx.fillStyle=gradient;ctx.fillRect(cx-30,top,60,14*up);ctx.beginPath();ctx.ellipse(cx,base,30,15,0,0,Math.PI);ctx.fill();ctx.beginPath();ctx.ellipse(cx,top,30,15,0,0,Math.PI*2);ctx.fill();
  for(let z=1;z<14;z+=.5)for(let a=0;a<Math.PI;a+=.25){ctx.fillStyle=z>=11?'#fff3c8':z>=6?'#ede2c6':'#d6c6a5';ctx.beginPath();ctx.ellipse(cx+Math.cos(a)*28,base+Math.sin(a)*14-z*up,3,2,0,0,Math.PI*2);ctx.fill();}
  people.filter(p=>!p.animation.behind||p.animation.onGround).sort((a,b)=>Math.sin(a.animation.angle)-Math.sin(b.animation.angle)).forEach(draw);
  ctx.fillStyle='#dce9f2';ctx.font='13px system-ui';ctx.fillText('包山示意 14m · 選手 1.7m · 紅衫男／綠衫女',cx-147,height-15);
}
if(typeof module!=='undefined'&&module.exports)module.exports={getBunHillClimberAnimationPose};
