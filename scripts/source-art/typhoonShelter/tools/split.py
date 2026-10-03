import numpy as np
from PIL import Image
from collections import deque

def components(alpha, scale=4, thr=20, min_px=300):
    """Connected components of the alpha mask (downsampled, 8-connected, dilated 2 cells
    so ropes/thin parts stay attached). Returns list of (mask_fullres_bool, bbox)."""
    H,W=alpha.shape
    h,w=H//scale,W//scale
    small=alpha[:h*scale,:w*scale].reshape(h,scale,w,scale).max((1,3))>thr
    d=small.copy()
    for _ in range(2):
        p=np.pad(d,1); d=p[1:-1,1:-1]|p[:-2,1:-1]|p[2:,1:-1]|p[1:-1,:-2]|p[1:-1,2:]|p[:-2,:-2]|p[2:,2:]|p[:-2,2:]|p[2:,:-2]
    lab=np.zeros((h,w),int); n=0
    for y in range(h):
        for x in range(w):
            if d[y,x] and not lab[y,x]:
                n+=1; q=deque([(y,x)]); lab[y,x]=n
                while q:
                    cy,cx=q.popleft()
                    for dy in (-1,0,1):
                        for dx in (-1,0,1):
                            ny,nx=cy+dy,cx+dx
                            if 0<=ny<h and 0<=nx<w and d[ny,nx] and not lab[ny,nx]:
                                lab[ny,nx]=n; q.append((ny,nx))
    full=np.kron(lab,np.ones((scale,scale),int))
    full=np.pad(full,((0,H-full.shape[0]),(0,W-full.shape[1])),mode='edge')
    out=[]
    for i in range(1,n+1):
        m=(full==i)&(alpha>thr)
        if m.sum()<min_px*scale*scale/4: continue
        ys,xs=np.nonzero(m)
        out.append((m,(xs.min(),ys.min(),xs.max(),ys.max())))
    out.sort(key=lambda t:(t[1][0]))
    return out
