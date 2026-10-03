// Shared projective texture mapping for the editor and offline bake.
const CHRISTMAS_WALL_ASSETS = Object.freeze(Array.from({ length: 46 }, (_, i) => `Models/festivals/Christmas/buildingDeco/BuildingDeco${i + 1}.png`));
function normalizeChristmasWalls(walls) {
  return (Array.isArray(walls) ? walls : []).slice(0, 4).filter(w =>
    CHRISTMAS_WALL_ASSETS.includes(w.asset) && Array.isArray(w.c) && w.c.length === 4 &&
    w.c.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))
  ).map(w => ({ asset: w.asset, c: w.c.map(p => p.map(v => Math.max(0, Math.min(1, v)))) }));
}
function christmasWallInverse(c) {
  const uv = [[0,0],[1,0],[1,1],[0,1]];
  const a = [];
  c.forEach(([x,y], i) => {
    const [u,v] = uv[i];
    a.push([x,y,1,0,0,0,-u*x,-u*y,u], [0,0,0,x,y,1,-v*x,-v*y,v]);
  });
  for (let k=0;k<8;k++) {
    let pivot=k;
    for(let j=k+1;j<8;j++) if(Math.abs(a[j][k])>Math.abs(a[pivot][k])) pivot=j;
    [a[k],a[pivot]]=[a[pivot],a[k]];
    if(Math.abs(a[k][k])<1e-10) return null;
    const d=a[k][k]; for(let j=k;j<=8;j++) a[k][j]/=d;
    for(let i=0;i<8;i++) if(i!==k) { const f=a[i][k]; for(let j=k;j<=8;j++) a[i][j]-=f*a[k][j]; }
  }
  return a.map(r=>r[8]);
}
function compositeChristmasWall(base, width, height, texture, tw, th, corners) {
  const h=christmasWallInverse(corners); if(!h) return;
  const x0=Math.max(0,Math.floor(Math.min(...corners.map(p=>p[0]))*width));
  const x1=Math.min(width,Math.ceil(Math.max(...corners.map(p=>p[0]))*width));
  const y0=Math.max(0,Math.floor(Math.min(...corners.map(p=>p[1]))*height));
  const y1=Math.min(height,Math.ceil(Math.max(...corners.map(p=>p[1]))*height));
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++) {
    const nx=(x+.5)/width, ny=(y+.5)/height, d=h[6]*nx+h[7]*ny+1;
    const u=(h[0]*nx+h[1]*ny+h[2])/d, v=(h[3]*nx+h[4]*ny+h[5])/d;
    if(!Number.isFinite(u)||!Number.isFinite(v)||u<0||u>1||v<0||v>1) continue;
    const i=(y*width+x)*4, s=(Math.min(th-1,Math.floor(v*th))*tw+Math.min(tw-1,Math.floor(u*tw)))*4;
    const alpha=texture[s+3]/255;
    for(let k=0;k<3;k++) base[i+k]=Math.round(base[i+k]*(1-alpha)+texture[s+k]*alpha);
    // Preserve the building silhouette, including its original alpha.
  }
}
if(typeof module!=='undefined' && module.exports) module.exports={ CHRISTMAS_WALL_ASSETS, normalizeChristmasWalls, christmasWallInverse, compositeChristmasWall };
