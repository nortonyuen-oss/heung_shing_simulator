"""Prepare measured dragon-boat geometry and isolated water markers. Run with .venv/bin/python -B."""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'scripts/source-art/festivals'
sys.path.insert(0, str(BASE.parent / 'typhoonShelter/tools'))
from correct import coeffs, transform_view
params = json.loads((BASE / 'isometric-correction.json').read_text())
# Waterline endpoints, excluding the upturned ornaments and spray; source image pixels.
ends = {
 'blackDragonNW': [[200,330],[1290,872]], 'blackDragonSW': [[200,800],[1320,430]],
 'blueDragonNW': [[168,380],[1300,854]], 'blueDragonSW': [[270,800],[1330,414]],
 'greenDragonNW': [[166,372],[1300,862]], 'greenDragonSW': [[270,780],[1330,430]],
 'purpleDragonNW': [[196,420],[1296,858]], 'purpleDragonSW': [[270,810],[1330,424]],
 'redDragonNW': [[158,354],[1312,860]], 'redDragonSW': [[270,760],[1330,410]],
 'yellowDragonNW': [[148,350],[1314,890]], 'yellowDragonSW': [[270,810],[1330,430]],
}
geometry = {}
for name, points in ends.items():
 rel = 'DragonBoat/' + name + '.png'
 img = Image.open(BASE / 'original' / rel).convert('RGBA')
 mask = np.asarray(img)[...,3] > 20
 ys,xs = np.nonzero(mask);x0,x1,y0,y1=xs.min(),xs.max()+1,ys.min(),ys.max()+1
 w,h=x1-x0,y1-y0;d,c=coeffs(params[rel]['views'][0]);cx=w/2
 T=-min(d*y+c*(x-cx) for x in (0,w) for y in (0,h))+8
 H=int(np.ceil(max(d*y+c*(x-cx) for x in (0,w) for y in (0,h))+T+8))
 a=np.asarray(img).copy();a[...,3]=np.where(mask,a[...,3],0)
 crop=Image.fromarray(a[y0:y1,x0:x1]).convert('RGBa')
 raw=crop.transform((w,H),Image.AFFINE,(1,0,0,-c/d,1/d,(c*cx-T)/d),resample=Image.BICUBIC).convert('RGBA')
 bb=raw.getchannel('A').point(lambda a:255 if a>2 else 0).getbbox()
 out=Image.open(BASE/rel);ob=out.getchannel('A').point(lambda a:255 if a>2 else 0).getbbox()
 k=(ob[2]-ob[0])/(bb[2]-bb[0])
 def mapped(p):
  x,y=p[0]-x0,p[1]-y0
  return [round(ob[0]+(x-bb[0])*k,3),round(ob[1]+(d*y+c*(x-cx)+T-bb[1])*k,3)]
 pts=list(map(mapped,points));anchor=[sum(p[i] for p in pts)/2 for i in (0,1)]
 geometry[name]={'anchor':anchor,'axisPoints':pts,'lengthM':18,'sourceWaterlinePoints':points}
# Use individual endpoints instead of stretching the connecting rope across six lanes.
for name,source,box,heightM in [
 ('startMarker','startLine',(0,500,430,1254),3),
 ('goalMarker','goalLine',(80,380,600,1254),4),
 ('raceBuoy','guardLine',(0,850,255,1210),1.2),
]:
 im=Image.open(BASE/'original/DragonBoat'/f'{source}.png').convert('RGBA').crop(box)
 im=im.crop(im.getchannel('A').point(lambda a:255 if a>=80 else 0).getbbox()); W=1<<(im.width+15).bit_length();H=1<<(im.height+15).bit_length()
 out=Image.new('RGBA',(W,H));out.alpha_composite(im,((W-im.width)//2,H-8-im.height));out.save(BASE/'DragonBoat'/f'{name}.png')
 # Water contact is near the base of the isolated marker, not the flag tip.
 geometry[name]={'anchor':[((W-im.width)//2+im.width/2),H-8-0.08*im.height],'heightM':heightM}
# Ground/water-contact samples on the corrected image, recorded here as preview pixels.
# Preview uses a 400x400 cell, image thumbnail fitted to 390x365, at cell top +30.
prop_refs = {
 'viewersStage': (16, [[821,353],[969,277]], [895,326], 2,0),
 'ceremonyStage': (10, [[44,776],[169,714]], [109,750], 0,1),
 'championStand1': (10, [[465,688],[665,784]], [565,751], 1,1),
 'championStand2': (10, [[817,720],[959,787]], [888,762], 2,1),
 'pier': (8, [[101,162],[269,73]], [185,143], 0,0),
 'rescueBoat': (7, [[427,245],[728,368]], [575,302], 1,0),
}
for name,(lengthM,points,anchor,col,row) in prop_refs.items():
 im=Image.open(BASE/'DragonBoat'/f'{name}.png');thumb=im.copy();thumb.thumbnail((390,365))
 sx=im.width/thumb.width;sy=im.height/thumb.height
 def source(p): return [round((p[0]-400*col)*sx,3),round((p[1]-400*row-30)*sy,3)]
 geometry[name]={'anchor':source(anchor),'axisPoints':[source(p) for p in points],'lengthM':lengthM}
(ROOT/'data/dragon-boat-geometry.json').write_text(json.dumps(geometry,ensure_ascii=False,indent=2)+'\n')
print('Prepared 12 measured boat waterlines, 3 isolated markers and 6 prop size references.')
