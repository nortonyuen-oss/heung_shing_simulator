"""Measured isometric calibration; preserves source art and records physical geometry.
Run: .venv/bin/python -B scripts/prepare-bun-hill-assets.py
"""
import json, math
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'scripts/source-art/festivals/original/bunHill'
DST = ROOT / 'Models/festivals/bunHill'
DST.mkdir(parents=True, exist_ok=True)
# Ground contacts: left/front/right support feet, not the elevated railing.
# Scale towers by human-height railings, not a nominal real-world tower height.
# These stylised originals have short, broad bodies; enlarging them to 14m enlarged the rails.
CONTROLS = {
 'bunHill1': dict(ground=[[47,1180],[546,1370],[1040,1128]], body=[[575,1140],[575,325]], radii=[180,65], rail=[[548,1344],[548,1180]], railHeightM=1.1),
 'bunHill2': dict(ground=[[42,1126],[572,1360],[1042,1113]], body=[[513,1110],[513,330]], radii=[175,65], rail=[[572,1320],[572,1170]], railHeightM=1.1),
 'bunHill3': dict(ground=[[46,1139],[583,1364],[1044,1115]], body=[[544,1112],[544,366]], radii=[185,65], rail=[[584,1332],[584,1160]], railHeightM=1.1),
 # Stair landings are at different elevations and cannot define an isometric plane.
 # Measure the three corners of the same horizontal eave beam, then project the
 # rectangular footprint vertically to the support level (380 source pixels).
 'bunHillStage': dict(ground=[[166,753],[1135,972],[1450,778]],
     beam=[[166,373],[1135,592],[1450,398]], lengthM=9, frontLocal=[0,1]),
 'bunHillSignboard': dict(ground=[[185,907],[1094,1216]], lengthM=6),
}
manifest = {'version':1, 'tileM':20, 'pixelsPerMetreUp':5, 'pixelsPerMetreAlong':2.5, 'parts':{}}
for name, spec in CONTROLS.items():
    points = spec['ground']
    down = (points[1][1]-points[0][1])/(points[1][0]-points[0][0])
    if len(points)==3:
        up = (points[1][1]-points[2][1])/(points[2][0]-points[1][0])
        d, c = 1/(down+up), (up-down)/(2*(down+up))
    else:
        d, c = 1, .5-down
    im = Image.open(SRC / f'{name}.png').convert('RGBA')
    # Premultiplied alpha prevents the original hidden brown RGB from fringing.
    ymin = min(0, c*im.width)
    height = math.ceil(d*im.height+abs(c)*im.width+16)
    transformed = im.convert('RGBa').transform((im.width,height),Image.Transform.AFFINE,
        (1,0,0,-c/d,1/d,(ymin-8)/d),resample=Image.Resampling.BICUBIC).convert('RGBA')
    box = transformed.getchannel('A').point(lambda a:255 if a>10 else 0).getbbox()
    content = transformed.crop(box)
    alpha = content.getchannel('A').point(lambda a:a if a>10 else 0)
    content.putalpha(alpha)
    W, H = 2**math.ceil(math.log2(content.width+16)), 2**math.ceil(math.log2(content.height+16))
    ox, oy = (W-content.width)//2, H-8-content.height
    out = Image.new('RGBA',(W,H)); out.alpha_composite(content,(ox,oy))
    out = out.convert('RGBa').resize((W//2,H//2),Image.Resampling.LANCZOS).convert('RGBA')
    W, H = W//2, H//2
    def mapped(p): return [round((p[0]-box[0]+ox)/2,4), round((d*p[1]+c*p[0]-ymin+8-box[1]+oy)/2,4)]
    ground = list(map(mapped,points))
    beam = list(map(mapped,spec['beam'])) if 'beam' in spec else None
    anchor = [(ground[0][i]+ground[-1][i])/2 for i in (0,1)]
    body = list(map(mapped,spec['body'])) if 'body' in spec else None
    sizepx = body[0][1]-body[1][1] if body else ground[1][0]-ground[0][0]
    rail = list(map(mapped,spec['rail'])) if 'rail' in spec else None
    scale = spec['railHeightM']*5/(rail[0][1]-rail[1][1]) if rail else spec['lengthM']*2.5/sizepx
    heightM = sizepx*scale/5 if body else None
    footprint = [abs(ground[1][0]-ground[0][0])*scale/2.5,
        abs(ground[2][0]-ground[1][0])*scale/2.5 if len(ground)==3 else 1]
    # Include the support foot blocks beyond their measured centre contacts.
    reserve = [math.ceil((v+2)/2)*2 for v in footprint]
    entry = dict(source=f'scripts/source-art/festivals/original/bunHill/{name}.png',
        width=W,height=H,sourceGround=points,ground=ground,anchor=anchor,
        affine={'d':d,'c':c},scale=scale,footprintM=footprint,reserveM=reserve,
        **(dict(sourceBeam=spec['beam'],beam=beam,frontLocal=spec['frontLocal']) if beam else {}),
        heightM=heightM,lengthM=spec.get('lengthM'),body=body,rail=rail,sourceRail=spec.get('rail'),railHeightM=spec.get('railHeightM'),radii=[r/2 for r in spec['radii']] if 'radii' in spec else None)
    for mirror in (False,True):
        key = name+('_m' if mirror else '')
        path=f'Models/festivals/bunHill/{key}.png'
        (ImageOps.mirror(out) if mirror else out).save(ROOT/path,optimize=True)
        meta = {**entry,'file':path,'mirrored':mirror}
        if mirror:
            meta['anchor']=[W-anchor[0],anchor[1]]
            meta['ground']=[[W-x,y] for x,y in ground]
            if beam: meta['beam']=[[W-x,y] for x,y in beam]
            if body: meta['body']=[[W-x,y] for x,y in body]
            if rail: meta['rail']=[[W-x,y] for x,y in rail]
        manifest['parts'][key]=meta
    print(name, (W,H), 'footprint metres', [round(n,2) for n in footprint], 'reserve',reserve)
(ROOT/'data/bun-hill-geometry.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
