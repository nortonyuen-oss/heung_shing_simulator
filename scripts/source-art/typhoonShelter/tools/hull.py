import sys, glob, json, numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, '.')
from split import components

def seam_split(mask, lo, hi):
    """Min-cost 8-connected vertical seam through alpha between columns lo..hi; returns left/right masks."""
    H,W=mask.shape
    cost=mask[:,lo:hi].astype(float)
    acc=cost.copy(); back=np.zeros_like(acc,int)
    for y in range(1,H):
        prev=acc[y-1]
        l=np.r_[np.inf,prev[:-1]]; r=np.r_[prev[1:],np.inf]
        st=np.vstack([l,prev,r]); i=st.argmin(0)
        acc[y]+=st[i,np.arange(st.shape[1])]; back[y]=i-1
    x=int(acc[-1].argmin()); seam=np.zeros(H,int)
    for y in range(H-1,-1,-1):
        seam[y]=x+lo; x=int(np.clip(x+back[y,x],0,hi-lo-1))
    cols=np.arange(W)[None,:]
    left=mask&(cols<seam[:,None]); right=mask&(cols>=seam[:,None])
    return left,right,seam

def lower_hull(mask):
    ys,xs=np.nonzero(mask)
    cols={}
    for x,y in zip(xs,ys):
        if y>cols.get(x,-1): cols[x]=y
    pts=sorted(cols.items())
    # lower hull in image coords (y down) = upper hull in math coords; keep points maximizing y
    hull=[]
    for p in pts:
        while len(hull)>=2:
            (x1,y1),(x2,y2)=hull[-2],hull[-1]
            # cross for turning: we want hull bulging downward (large y)
            if (x2-x1)*(p[1]-y1)-(y2-y1)*(p[0]-x1) >= 0: hull.pop()
            else: break
        hull.append(p)
    return hull

def edge_slopes(hull, min_len=40):
    segs=[]
    for (x1,y1),(x2,y2) in zip(hull,hull[1:]):
        dx,dy=x2-x1,y2-y1; L=np.hypot(dx,dy)
        if dx>0 and L>=min_len: segs.append((dy/dx,L,(x1,y1,x2,y2)))
    down=[s for s in segs if 0.12<s[0]<1.5]
    up=[s for s in segs if -1.5<s[0]<-0.12]
    def best(ss):
        if not ss: return None
        s=max(ss,key=lambda t:t[1]); return dict(slope=round(abs(s[0]),3),len=round(s[1]),seg=[int(v) for v in s[2]])
    return best(down),best(up)
