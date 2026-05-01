#!/usr/bin/env python3
"""Tab 图标生成器 v3 - 铅笔/作业图标"""

import struct, zlib, math, os

SZ = 81
def png(px):
    def c(t,d):
        x=t+d; return struct.pack('>I',len(d))+x+struct.pack('>I',zlib.crc32(x)&0xFFFFFFFF)
    h=b'\x89PNG\r\n\x1a\n'
    ihdr=c(b'IHDR',struct.pack('>IIBBBBB',SZ,SZ,8,6,0,0,0))
    raw=b''
    for y in range(SZ):
        raw+=b'\x00'
        for x in range(SZ):
            i=(y*SZ+x)*4
            for ch in px[i:i+4]: raw+=bytes([max(0,min(255,ch))])
    return h+ihdr+c(b'IDAT',zlib.compress(raw,1))+c(b'IEND',b'')

def C(): return [0]*(SZ*SZ*4)
def S(px,x,y,r,g,b,a=255):
    if 0<=x<SZ and 0<=y<SZ:
        i=(y*SZ+x)*4; px[i]=max(0,min(255,r)); px[i+1]=max(0,min(255,g)); px[i+2]=max(0,min(255,b)); px[i+3]=max(0,min(255,a))
def FC(px,cx,cy,rad,r,g,b,a=255):
    for y in range(max(0,int(cy-rad-1)),min(SZ,int(cy+rad+2))):
        for x in range(max(0,int(cx-rad-1)),min(SZ,int(cx+rad+2))):
            d=math.sqrt((x-cx)**2+(y-cy)**2)
            if d<=rad:
                aa=a if d<=rad-1 else int(a*(rad-d+1)); S(px,x,y,r,g,b,max(0,min(255,aa)))
def FR(px,x1,y1,x2,y2,r,g,b,a=255):
    for y in range(max(0,int(y1)),min(SZ,int(y2)+1)):
        for x in range(max(0,int(x1)),min(SZ,int(x2)+1)):
            S(px,x,y,r,g,b,a)
def FRR(px,x1,y1,x2,y2,rad,r,g,b,a=255):
    for y in range(max(0,int(y1)),min(SZ,int(y2)+1)):
        for x in range(max(0,int(x1)),min(SZ,int(x2)+1)):
            ok=True
            if x<x1+rad and y<y1+rad and (x-x1-rad)**2+(y-y1-rad)**2>rad**2: ok=False
            if x>x2-rad and y<y1+rad and (x-x2+rad)**2+(y-y1-rad)**2>rad**2: ok=False
            if x<x1+rad and y>y2-rad and (x-x1-rad)**2+(y-y2+rad)**2>rad**2: ok=False
            if x>x2-rad and y>y2-rad and (x-x2+rad)**2+(y-y2+rad)**2>rad**2: ok=False
            if ok: S(px,x,y,r,g,b,a)
def DL(px,x1,y1,x2,y2,th,r,g,b,a=255):
    dx,dy=x2-x1,y2-y1; steps=max(int(max(abs(dx),abs(dy))/0.5),1); half=th/2
    for i in range(steps+1):
        t=i/steps; cx=x1+dx*t; cy=y1+dy*t
        for py in range(int(cy-half-1),int(cy+half+2)):
            for px2 in range(int(cx-half-1),int(cx+half+2)):
                d=math.sqrt((px2-cx)**2+(py-cy)**2)
                if d<=half+0.5:
                    aa=a if d<=half-0.5 else int(a*(half+0.5-d)); S(px,px2,py,r,g,b,max(0,min(255,aa)))

# ============= 图标 =============

def icon_home(rgb):
    px=C(); r,g,b=rgb
    dr=(max(0,r-40),max(0,g-40),max(0,b-40))
    # 屋顶
    for y in range(12,42):
        progress=(y-12)/(42-12); hw=int(progress*(68-12)//2)
        for x in range(40-hw,40+hw+1): S(px,x,y,r,g,b)
    # 屋体
    FRR(px,19,40,61,68,3,r,g,b)
    # 门
    for y in range(49,69):
        for x in range(34,47): i=(y*SZ+x)*4; px[i]=px[i+1]=px[i+2]=px[i+3]=0
    # 窗
    FRR(px,23,45,30,54,2,255,255,255,200); FRR(px,50,45,57,54,2,255,255,255,200)
    # 门把手
    FC(px,45,58,1.5,*dr)
    return px

def icon_course(rgb):
    px=C(); r,g,b=rgb
    dr=(max(0,r-45),max(0,g-45),max(0,b-45))
    # 左页
    FRR(px,13,16,38,65,4,r,g,b)
    # 右页
    FRR(px,42,16,67,65,4,r,g,b)
    # 中缝
    for y in range(14,67):
        for x in range(38,43): S(px,x,y,*dr)
    # 左页横线
    for y in [26,36,46,56]: DL(px,17,y,35,y,1,*dr,140)
    # 右页横线
    for y in [26,36,46,56]: DL(px,46,y,64,y,1,*dr,140)
    return px

def icon_homework(rgb):
    """作业：铅笔图标（斜放）"""
    px=C(); r,g,b=rgb
    dr=(max(0,r-40),max(0,g-40),max(0,b-40))
    pnk=(255,130,140)  # 铅笔粉色橡皮
    
    # 铅笔是一条斜线（从右上到左下）
    # 笔尖在左下，橡皮在右上
    
    # 笔身（斜矩形）- 绘制两条平行线
    # 中线：从 (56,18) 到 (22,58)
    # 用描边方式画粗线
    steps = 200
    half = 5.5  # 笔身半宽
    for i in range(steps):
        t = i / steps
        cx = 56 - (56-22) * t
        cy = 18 + (58-18) * t
        # 垂直线方向
        dx = -(58-18); dy = (56-22)
        dl = math.sqrt(dx*dx + dy*dy)
        if dl == 0: continue
        nx, ny = -dy/dl, dx/dl  # 法线
        for w in range(-int(half)-1, int(half)+2):
            wx = cx + nx * w; wy = cy + ny * w
            d2 = abs(w) - half
            aa = 255 if d2 <= 0 else max(0, int(255*(1-d2)))
            S(px, wx, wy, r, g, b, aa)
    
    # 橡皮（右上端）- 画一个小矩形
    FRR(px, 50,14, 60,22, 2, *pnk)
    # 橡皮分界
    for i in range(200):
        t = i/200; cx=56-(56-22)*t; cy=18+(58-18)*t
        if t < 0.15:  # 橡皮位置
            dx=-(58-18); dy=(56-22); dl=math.sqrt(dx*dx+dy*dy)
            if dl>0:
                nx,ny=-dy/dl,dx/dl
                for w in range(-6,7): S(px,cx+nx*w,cy+ny*w,*dr,200)
    
    # 笔尖（三角形）
    # 笔尖在 (22,58) 附近
    for y in range(54, 68):
        for x in range(18, 30):
            # 在笔尖位置画一个小三角形
            pass  # 用另一种方式处理
    
    # 简化：在笔尖处画一个小三角
    for t2 in range(100):
        t = 0.85 + t2/100 * 0.15
        cx = 56 - (56-22) * t
        cy = 18 + (58-18) * t
        dx=-(58-18); dy=(56-22); dl=math.sqrt(dx*dx+dy*dy)
        if dl>0:
            nx,ny=-dy/dl,dx/dl
            for w in range(-3,4): S(px,cx+nx*w,cy+ny*w,255,200,100)
    
    # 笔尖黑色端点
    FC(px, 22, 58, 2, 50,50,50)
    
    return px

def icon_profile(rgb):
    px=C(); r,g,b=rgb
    # 头
    FC(px,40,24,13,r,g,b)
    # 身体
    for y in range(44,69):
        for x in range(12,69):
            d=math.sqrt((x-40)**2+(y-80)**2)
            if d<=32: S(px,x,y,r,g,b)
    return px

# ============= main =============

def main():
    out = os.path.dirname(os.path.abspath(__file__))
    icons=[('tab-home.png',icon_home),('tab-course.png',icon_course),('tab-homework.png',icon_homework),('tab-profile.png',icon_profile)]
    for fn,func in icons:
        for suf,col in [('',(154,151,170)),('-active',(167,251,245))]:
            px=func(col); data=png(px)
            with open(os.path.join(out,fn.replace('.png',suf+'.png')),'wb') as f: f.write(data)
            print(f"✓ {fn.replace('.png',suf+'.png')} ({len(data)} bytes)")

if __name__=='__main__': main()
