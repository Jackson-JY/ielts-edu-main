#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Tab 图标生成器 - 简化可靠版
每个图标用直接像素写入，确保内容正确
"""

import struct
import zlib
import os
import math

SZ = 81

def make_png(pixels):
    """RGBA -> PNG"""
    def chk(t, d):
        c = t + d
        return struct.pack('>I', len(d)) + c + struct.pack('>I', zlib.crc32(c) & 0xFFFFFFFF)
    h = b'\x89PNG\r\n\x1a\n'
    ihdr = chk(b'IHDR', struct.pack('>IIBBBBB', SZ, SZ, 8, 6, 0, 0, 0))
    raw = b''
    for y in range(SZ):
        raw += b'\x00'
        for x in range(SZ):
            i = (y * SZ + x) * 4
            raw += bytes([pixels[i], pixels[i+1], pixels[i+2], pixels[i+3]])
    idat = chk(b'IDAT', zlib.compress(raw, 1))
    iend = chk(b'IEND', b'')
    return h + ihdr + idat + iend

def canvas():
    return [0] * (SZ * SZ * 4)

def setpx(px, x, y, r, g, b, a=255):
    if 0 <= x < SZ and 0 <= y < SZ:
        i = (y * SZ + x) * 4
        px[i]   = max(0, min(255, int(r)))
        px[i+1] = max(0, min(255, int(g)))
        px[i+2] = max(0, min(255, int(b)))
        px[i+3] = max(0, min(255, int(a)))

def fill_circle(px, cx, cy, rad, r, g, b, a=255):
    for y in range(max(0,int(cy-rad-1)), min(SZ,int(cy+rad+2))):
        for x in range(max(0,int(cx-rad-1)), min(SZ,int(cx+rad+2))):
            d = math.sqrt((x-cx)**2 + (y-cy)**2)
            if d <= rad:
                aa = a
                if d > rad - 1.0:
                    aa = int(a * (rad - d + 1.0))
                    if aa < 0: aa = 0
                setpx(px, x, y, r, g, b, aa)

def fill_rect(px, x1, y1, x2, y2, r, g, b, a=255):
    for y in range(max(0,int(y1)), min(SZ,int(y2)+1)):
        for x in range(max(0,int(x1)), min(SZ,int(x2)+1)):
            setpx(px, x, y, r, g, b, a)

def fill_triangle(px, x1,y1, x2,y2, x3,y3, r,g,b, a=255):
    min_y = max(0, int(min(y1,y2,y3)))
    max_y = min(SZ-1, int(max(y1,y2,y3)))
    for y in range(min_y, max_y+1):
        xs = []
        for (ax,ay),(bx,by) in [((x1,y1),(x2,y2)),((x2,y2),(x3,y3)),((x3,y3),(x1,y1))]:
            if (ay <= y < by) or (by <= y < ay):
                if by != ay:
                    ix = int(ax + (y - ay) * (bx - ax) / (by - ay))
                    xs.append(ix)
        if len(xs) >= 2:
            xs.sort()
            for x in range(xs[0], xs[-1]+1):
                setpx(px, x, y, r, g, b, a)

def fill_rounded(px, x1,y1, x2,y2, rad, r,g,b, a=255):
    for y in range(max(0,int(y1)), min(SZ,int(y2)+1)):
        for x in range(max(0,int(x1)), min(SZ,int(x2)+1)):
            ok = True
            # 左上
            if x < x1+rad and y < y1+rad:
                if (x-x1-rad)**2 + (y-y1-rad)**2 > rad*rad: ok = False
            # 右上
            if x > x2-rad and y < y1+rad:
                if (x-x2+rad)**2 + (y-y1-rad)**2 > rad*rad: ok = False
            # 左下
            if x < x1+rad and y > y2-rad:
                if (x-x1-rad)**2 + (y-y2+rad)**2 > rad*rad: ok = False
            # 右下
            if x > x2-rad and y > y2-rad:
                if (x-x2+rad)**2 + (y-y2+rad)**2 > rad*rad: ok = False
            if ok:
                setpx(px, x, y, r, g, b, a)

def draw_ring(px, cx, cy, out_r, in_r, r, g, b, a=255):
    for y in range(max(0,int(cy-out_r-1)), min(SZ,int(cy+out_r+2))):
        for x in range(max(0,int(cx-out_r-1)), min(SZ,int(cx+out_r+2))):
            d = math.sqrt((x-cx)**2 + (y-cy)**2)
            if in_r <= d <= out_r:
                aa = a
                if d < in_r + 1: aa = int(a*(d-in_r))
                if d > out_r - 1: aa = int(a*(out_r-d))
                aa = max(0, min(255, aa))
                setpx(px, x, y, r, g, b, aa)

# ============= 图标设计 =============

def icon_home(rgb):
    """首页：房子"""
    px = canvas(); r,g,b = rgb
    # 屋顶三角形
    fill_triangle(px, 40,10, 12,42, 68,42, r,g,b)
    # 屋体
    fill_rounded(px, 18,40, 62,68, 4, r,g,b)
    # 门（透明）
    for y in range(50, 69):
        for x in range(33, 47):
            i = (y*SZ+x)*4; px[i]=0; px[i+1]=0; px[i+2]=0; px[i+3]=0
    # 窗户
    fill_rect(px, 22,44, 30,54, 255,255,255, 200)
    fill_rect(px, 50,44, 58,54, 255,255,255, 200)
    return px

def icon_course(rgb):
    """学习：打开的书"""
    px = canvas(); r,g,b = rgb
    # 书页左
    fill_rounded(px, 12,18, 38,64, 4, r,g,b)
    # 书页右
    fill_rounded(px, 42,18, 68,64, 4, r,g,b)
    # 中间缝
    for y in range(16, 66):
        for x in range(38, 43):
            setpx(px, x, y, max(0,r-50), max(0,g-50), max(0,b-50))
    # 左页横线
    for y in [28,38,48,58]:
        for x in range(16, 35):
            setpx(px, x, y, 255,255,255, 180)
    # 右页横线
    for y in [28,38,48,58]:
        for x in range(46, 65):
            setpx(px, x, y, 255,255,255, 180)
    return px

def icon_homework(rgb):
    """作业：铅笔/编辑图标"""
    px = canvas(); r,g,b = rgb
    
    # 画一个铅笔图标（倾斜45度）
    # 笔身主体（长方形，倾斜）
    cx, cy = 40, 40
    
    # 笔身（从左上到右下的粗线）
    for t in range(0, 100):
        # 笔身中心线
        x = 22 + t * 0.36  # 从22到58
        y = 18 + t * 0.36  # 从18到54
        # 笔身宽度
        for w in range(-5, 6):
            wx = x + w * 0.7
            wy = y - w * 0.7
            setpx(px, wx, wy, r, g, b)
    
    # 笔尖（三角形）
    for y in range(50, 62):
        for x in range(50, 62):
            # 笔尖三角形区域
            if x - 50 + y - 50 < 10:
                setpx(px, x, y, r, g, b)
    
    # 笔尾橡皮（顶部）
    for t in range(-10, 5):
        x = 22 + t * 0.36
        y = 18 + t * 0.36
        for w in range(-6, 7):
            wx = x + w * 0.7
            wy = y - w * 0.7
            setpx(px, wx, wy, r, g, b)
    
    # 橡皮和笔身的分界线
    for t in range(0, 100):
        x = 26 + t * 0.36
        y = 22 + t * 0.36
        for w in range(-6, 7):
            wx = x + w * 0.7
            wy = y - w * 0.7
            setpx(px, wx, wy, max(0,r-30), max(0,g-30), max(0,b-30))
    
    return px

def icon_profile(rgb):
    """我的：人物轮廓"""
    px = canvas(); r,g,b = rgb
    # 头
    fill_circle(px, 40, 24, 13, r,g,b)
    # 身体（弧形）
    for y in range(44, 69):
        for x in range(12, 69):
            d = math.sqrt((x-40)**2 + (y-80)**2)
            if d <= 32:
                setpx(px, x, y, r, g, b)
    return px

# ============= 主程序 =============

def main():
    out = os.path.dirname(os.path.abspath(__file__))
    unsel = (154, 151, 170)
    sel = (167, 251, 245)
    
    icons = [
        ('tab-home.png', icon_home),
        ('tab-course.png', icon_course),
        ('tab-homework.png', icon_homework),
        ('tab-profile.png', icon_profile),
    ]
    
    for fname, func in icons:
        for suffix, color in [('', unsel), ('-active', sel)]:
            px = func(color)
            data = make_png(px)
            path = os.path.join(out, fname.replace('.png', f'{suffix}.png'))
            with open(path, 'wb') as f:
                f.write(data)
            print(f"✓ {os.path.basename(path)} ({len(data)} bytes)")

if __name__ == '__main__':
    main()
