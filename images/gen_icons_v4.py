#!/usr/bin/env python3
"""图标生成 v4 - 像素级绘制，确保图标清晰美观"""

import struct, zlib, os

SZ = 81
def make_png(px):
    def chk(t,d):
        x=t+d; return struct.pack('>I',len(d))+x+struct.pack('>I',zlib.crc32(x)&0xFFFFFFFF)
    h=b'\x89PNG\r\n\x1a\n'
    ihdr=chk(b'IHDR',struct.pack('>IIBBBBB',SZ,SZ,8,6,0,0,0))
    raw=b''
    for y in range(SZ):
        raw+=b'\x00'
        for x in range(SZ):
            i=(y*SZ+x)*4
            r=max(0,min(255,px[i])); g=max(0,min(255,px[i+1])); b=max(0,min(255,px[i+2])); a=max(0,min(255,px[i+3]))
            raw+=bytes([r,g,b,a])
    return h+ihdr+chk(b'IDAT',zlib.compress(raw,9))+chk(b'IEND',b'')

def C(): return [0]*(SZ*SZ*4)
def P(px,x,y,r,g,b,a=255):
    if 0<=x<SZ and 0<=y<SZ:
        i=(y*SZ+x)*4; px[i]=max(0,min(255,r)); px[i+1]=max(0,min(255,g)); px[i+2]=max(0,min(255,b)); px[i+3]=max(0,min(255,a))
def FC(px,cx,cy,r,rad,*c,a=255):
    for y in range(max(0,int(cy-rad-1)),min(SZ,int(cy+rad+2))):
        for x in range(max(0,int(cx-rad-1)),min(SZ,int(cx+rad+2))):
            d=((x-cx)**2+(y-cy)**2)**0.5
            if d<=rad:
                aa=a if d<=rad-0.5 else int(a*(rad-d+0.5))
                P(px,x,y,*c,max(0,min(255,aa)))
def FR(px,x1,y1,x2,y2,r,g,b,a=255):
    for y in range(max(0,int(y1)),min(SZ,int(y2)+1)):
        for x in range(max(0,int(x1)),min(SZ,int(x2)+1)):
            P(px,x,y,r,g,b,a)
def AA(px,x1,y1,x2,y2,th,*c,a=255):
    """抗锯齿粗线"""
    dx,dy=x2-x1,y2-y1; steps=max(int(max(abs(dx),abs(dy))/0.3),1); half=th/2
    for i in range(steps+1):
        t=i/steps; cx=x1+dx*t; cy=y1+dy*t
        for py in range(int(cy-half-1),int(cy+half+2)):
            for px2 in range(int(cx-half-1),int(cx+half+2)):
                d=((px2-cx)**2+(py-cy)**2)**0.5
                if d<=half+0.5:
                    aa=a if d<=half-0.5 else int(a*(half+0.5-d))
                    P(px,px2,py,*c,max(0,min(255,aa)))

def icon_home(c):
    px=C(); r,g,b=c; d=(max(0,r-50),max(0,g-50),max(0,b-50))
    # 屋顶
    for y in range(12,42):
        prog=(y-12)/29.0; hw=int(prog*28)
        for x in range(40-hw,40+hw+1): P(px,x,y,r,g,b)
    # 屋顶底边线
    AA(px,12,42,68,42,1.5,*d)
    # 屋体
    for y in range(41,69):
        for x in range(19,62):
            # 圆角
            inside=True
            if x<19+4 and y<41+4 and (x-23)**2+(y-45)**2>16: inside=False
            if x>62-4 and y<41+4 and (x-58)**2+(y-45)**2>16: inside=False
            if inside: P(px,x,y,r,g,b)
    # 门
    for y in range(49,69):
        for x in range(34,47): i=(y*SZ+x)*4; px[i]=px[i+1]=px[i+2]=px[i+3]=0
    # 门框
    AA(px,34,49,34,68,1,*d); AA(px,46,49,46,68,1,*d); AA(px,34,49,46,49,1,*d)
    # 门把手
    FC(px,44,59,1.2,*d)
    # 左窗
    FR(px,23,45,30,54,255,255,255,200); FR(px,24,46,29,53,*c)
    # 右窗
    FR(px,50,45,57,54,255,255,255,200); FR(px,51,46,56,53,*c)
    return px

def icon_course(c):
    px=C(); r,g,b=c; d=(max(0,r-50),max(0,g-50),max(0,b-50))
    # 左页
    for y in range(16,66):
        for x in range(13,39):
            inside=True
            if x<17 and y<20 and (x-17)**2+(y-20)**2>16: inside=False
            if x>35 and y<20 and (x-35)**2+(y-20)**2>16: inside=False
            if x<17 and y>62 and (x-17)**2+(y-62)**2>16: inside=False
            if x>35 and y>62 and (x-35)**2+(y-62)**2>16: inside=False
            if inside: P(px,x,y,r,g,b)
    # 右页
    for y in range(16,66):
        for x in range(41,67):
            inside=True
            if x<45 and y<20 and (x-45)**2+(y-20)**2>16: inside=False
            if x>63 and y<20 and (x-63)**2+(y-20)**2>16: inside=False
            if x<45 and y>62 and (x-45)**2+(y-62)**2>16: inside=False
            if x>63 and y>62 and (x-63)**2+(y-62)**2>16: inside=False
            if inside: P(px,x,y,r,g,b)
    # 内页白
    for y in range(20,62):
        for x in range(17,35): P(px,x,y,255,255,255,230)
        for x in range(45,63): P(px,x,y,255,255,255,230)
    # 中缝
    for y in range(14,67): FR(px,38,y,42,y,*d)
    # 左页线
    for y in [25,35,45,55]: AA(px,19,y,36,y,1,*d,130)
    # 右页线
    for y in [25,35,45,55]: AA(px,46,y,61,y,1,*d,130)
    return px

def icon_homework(c):
    """作业：铅笔图标"""
    px=C(); r,g,b=c
    # 铅笔斜线：从 (58,16) 到 (20,62)
    # 笔身（粗线）
    AA(px,58,16,20,62,7,r,g,b)
    # 橡皮端（右上，粉色）
    AA(px,58,16,58,16,9,255,140,150)
    # 橡皮分界
    AA(px,58,16,20,62,7.5,255,140,150)
    for i in range(50):
        t=i/50; cx=58-(58-20)*t; cy=16+(62-16)*t
        if t<0.12:
            AA(px,58,16,20,62,8,*c)
    # 笔尖（黑色）
    AA(px,20,62,20,62,3,80,80,80)
    # 笔尖削尖效果
    for t2 in range(20):
        t=0.88+t2/20*0.12
        cx=58-(58-20)*t; cy=16+(62-16)*t
        if t2>10:
            aa=255 if t2<17 else int(255*(20-t2)/3)
            if 0<=int(cx)<SZ and 0<=int(cy)<SZ:
                ox=cx+3; oy=cy
                P(px,ox,oy,80,80,80,aa)
    return px

def icon_profile(c):
    px=C(); r,g,b=c
    # 头
    FC(px,40,24,13,r,g,b)
    # 身体（椭圆）
    for y in range(44,69):
        for x in range(12,69):
            dx=(x-40)/28.0; dy=(y-65)/18.0
            if dx*dx+dy*dy<=1.0: P(px,x,y,r,g,b)
    return px

def main():
    out=os.path.dirname(os.path.abspath(__file__))
    for name,fn in [('tab-home',icon_home),('tab-course',icon_course),('tab-homework',icon_homework),('tab-profile',icon_profile)]:
        for suf,col in [('',(154,151,170)),('-active',(167,251,245))]:
            px=fn(col); data=make_png(px)
            with open(os.path.join(out,f'{name}{suf}.png'),'wb') as f: f.write(data)
            print(f"✓ {name}{suf}.png ({len(data)} bytes)")
    print('✅ 完成')

if __name__=='__main__': main()
