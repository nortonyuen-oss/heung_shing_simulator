// Reuse the promenade's corrected 10m dark-red brick modules at 20m per tile.
// All 16 exposed-edge variants have identical 512x256 canvases and ground anchors.
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
async function raw(file) {
  const {data,info} = await sharp(path.join(root,file)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  return {data,...info};
}
function sample(img,x,y) {
  x=Math.max(0,Math.min(img.width-1,x)); y=Math.max(0,Math.min(img.height-1,y));
  const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
  return [0,1,2].map(k=>{
    const at=(a,b)=>img.data[(Math.min(img.height-1,b)*img.width+Math.min(img.width-1,a))*4+k];
    return (at(ix,iy)*(1-fx)+at(ix+1,iy)*fx)*(1-fy)+(at(ix,iy+1)*(1-fx)+at(ix+1,iy+1)*fx)*fy;
  });
}
(async()=>{
  const brick=await raw('Models/typhoonShelter/ts_promenadeBrick_a.png');
  const kerb=await raw('Models/typhoonShelter/ts_promenadeKerbFront_a.png');
  for(let mask=0;mask<16;mask++) {
    const data=Buffer.alloc(512*256*4);
    for(let y=0;y<256;y++)for(let x=0;x<512;x++){
      const c=((y-1)/127+(x-256)/254)/2,r=((y-1)/127-(x-256)/254)/2;
      if(r<0||c<0||r>1||c>1)continue;
      const u=(c*2)%1,v=(r*2)%1;
      // Source ground corners: left(112,147), front(256.5,219), right(400,148).
      let rgb=sample(brick,255.5+144.5*u-143.5*v,76+72*u+71*v);
      const edges=[r,1-c,1-r,c];
      const edge=edges.findIndex((d,i)=>(mask&(1<<i))&&d<.03);
      if(edge>=0){
        const along=edge%2?r:c;
        const q=(along*20)%1;
        rgb=sample(kerb,50+146*q+8*edges[edge]/.03,99-73*q+4*edges[edge]/.03);
        if(q<.035||edges[edge]>.027)rgb=rgb.map(value=>value*.70);
      }
      const at=(y*512+x)*4;
      rgb.forEach((value,k)=>data[at+k]=Math.round(value));data[at+3]=255;
    }
    const name=mask===15?'eventGround.png':`eventGround_edges${mask}.png`;
    await sharp(data,{raw:{width:512,height:256,channels:4}}).png().toFile(path.join(root,'Models/parks/park1x1',name));
  }
  console.log('Built 16 promenade-brick activity-ground variants.');
})().catch(error=>{console.error(error);process.exitCode=1;});
