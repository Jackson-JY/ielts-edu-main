#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成精美的微信小程序 Tab 图标（改进版）
- 使用改进的绘图算法
- 未选中：灰色 #9A97AA
- 选中：主题色 #A7FBF5
"""

import struct
import zlib
import math
import os

SIZE = 81
CENTER = SIZE // 2  # 40

def make_png(raw_rgba):
    """将 RGBA 像素数据转换为 PNG 二进制"""
    def chunk(ctype, data):
        c = ctype + data
        crc = struct.pack('>I', zlib.crc32(c) & 0xFFFFFFFF)
        return struct.pack('>I', len(data)) + c + crc

    header = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', SIZE, SIZE, 8, 6, 0, 0, 0))
    
    raw = b''
    for y in range(SIZE):
        raw += b'\x00'
        for x in range(SIZE):
            i = (y * SIZE + x) * 4
            raw += bytes(raw_rgba[i:i+4])
    
    idat = chunk(b'IDAT', zlib.compress(raw, 9))
    iend = chunk(b'IEND', b'')
    return header + ihdr + idat + iend

def new_canvas():
    """创建透明画布"""
    return [0] * (SIZE * SIZE * 4)

def put(canvas, x, y, r, g, b, a=255):
    """安全设置像素（含 Alpha 混合）"""
    x = int(round(x))
    y = int(round(y))
    if 0 <= x < SIZE and 0 <= y < SIZE:
        i = (y * SIZE + x) * 4
        # Alpha 混合
        old_a = canvas[i+3] / 255.0
        new_a = a / 255.0
        out_a = new_a + old_a * (1 - new_a)
        if out_a > 0:
            canvas[i]   = int((r * new_a + canvas[i] * old_a * (1 - new_a)) / out_a)
            canvas[i+1] = int((g * new_a + canvas[i+1] * old_a * (1 - new_a)) / out_a)
            canvas[i+2] = int((b * new_a + canvas[i+2] * old_a * (1 - new_a)) / out_a)
            canvas[i+3] = int(out_a * 255)

def fill_rect(canvas, x1, y1, x2, y2, r, g, b, a=255):
    """填充矩形"""
    for y in range(max(0, int(y1)), min(SIZE, int(y2)+1)):
        for x in range(max(0, int(x1)), min(SIZE, int(x2)+1)):
            put(canvas, x, y, r, g, b, a)

def fill_circle(canvas, cx, cy, radius, r, g, b, a=255):
    """填充圆形（抗锯齿）"""
    for y in range(max(0, int(cy - radius - 2)), min(SIZE, int(cy + radius + 2))):
        for x in range(max(0, int(cx - radius - 2)), min(SIZE, int(cx + radius + 2))):
            dist = math.sqrt((x - cx)**2 + (y - cy)**2)
            if dist <= radius - 0.5:
                put(canvas, x, y, r, g, b, a)
            elif dist <= radius + 0.5:
                alpha = int(a * (radius + 0.5 - dist))
                put(canvas, x, y, r, g, b, alpha)

def fill_ring(canvas, cx, cy, outer_r, inner_r, r, g, b, a=255):
    """填充圆环"""
    for y in range(max(0, int(cy - outer_r - 2)), min(SIZE, int(cy + outer_r + 2))):
        for x in range(max(0, int(cx - outer_r - 2)), min(SIZE, int(cx + outer_r + 2))):
            dist = math.sqrt((x - cx)**2 + (y - cy)**2)
            if inner_r - 0.5 <= dist <= outer_r + 0.5:
                if dist < inner_r - 0.5 or dist > outer_r + 0.5:
                    alpha = int(a * (1.0 - abs(dist - (inner_r if dist < inner_r else outer_r)) / 1.0))
                    put(canvas, x, y, r, g, b, max(0, min(255, alpha)))
                else:
                    put(canvas, x, y, r, g, b, a)

def draw_line_thick(canvas, x1, y1, x2, y2, thickness, r, g, b, a=255):
    """绘制粗线（抗锯齿）"""
    dx = x2 - x1
    dy = y2 - y1
    length = math.sqrt(dx**2 + dy**2)
    if length == 0:
        return
    
    steps = int(length * 2) + 1
    half = thickness / 2.0
    
    for i in range(steps + 1):
        t = i / steps
        cx = x1 + dx * t
        cy = y1 + dy * t
        # 绘制圆形端点实现粗线
        for py in range(int(cy - half - 1), int(cy + half + 2)):
            for px in range(int(cx - half - 1), int(cx + half + 2)):
                dist = math.sqrt((px - cx)**2 + (py - cy)**2)
                if dist <= half + 0.5:
                    alpha = a if dist <= half - 0.5 else int(a * (half + 0.5 - dist))
                    put(canvas, px, py, r, g, b, max(0, min(255, alpha)))

def fill_rounded_rect(canvas, x1, y1, x2, y2, radius, r, g, b, a=255):
    """填充圆角矩形"""
    for y in range(max(0, int(y1)), min(SIZE, int(y2)+1)):
        for x in range(max(0, int(x1)), min(SIZE, int(x2)+1)):
            # 判断是否在圆角范围内
            inside = True
            
            # 左上角
            if x < x1 + radius and y < y1 + radius:
                if (x - x1 - radius)**2 + (y - y1 - radius)**2 > radius**2:
                    inside = False
            # 右上角
            elif x > x2 - radius and y < y1 + radius:
                if (x - x2 + radius)**2 + (y - y1 - radius)**2 > radius**2:
                    inside = False
            # 左下角
            elif x < x1 + radius and y > y2 - radius:
                if (x - x1 - radius)**2 + (y - y2 + radius)**2 > radius**2:
                    inside = False
            # 右下角
            elif x > x2 - radius and y > y2 - radius:
                if (x - x2 + radius)**2 + (y - y2 + radius)**2 > radius**2:
                    inside = False
            
            if inside:
                put(canvas, x, y, r, g, b, a)

def draw_triangle(canvas, x1, y1, x2, y2, x3, y3, r, g, b, a=255):
    """填充三角形（扫描线）"""
    min_y = max(0, int(min(y1, y2, y3)))
    max_y = min(SIZE-1, int(max(y1, y2, y3)))
    
    for y in range(min_y, max_y + 1):
        xs = []
        edges = [(x1, y1, x2, y2), (x2, y2, x3, y3), (x3, y3, x1, y1)]
        for ex1, ey1, ex2, ey2 in edges:
            if (ey1 <= y < ey2) or (ey2 <= y < ey1):
                if ey2 != ey1:
                    x = ex1 + (y - ey1) * (ex2 - ex1) / (ey2 - ey1)
                    xs.append(x)
        if len(xs) >= 2:
            xs.sort()
            for x in range(int(xs[0]), int(xs[-1]) + 1):
                put(canvas, x, y, r, g, b, a)

# ============ 图标生成函数 ============

def gen_home(color_rgb):
    """首页 - 精致房屋图标"""
    c = new_canvas()
    r, g, b = color_rgb
    cx = CENTER
    
    # 屋顶（三角形）
    roof_peak_x, roof_peak_y = cx, 14
    roof_left_x, roof_left_y = 13, 40
    roof_right_x, roof_right_y = 67, 40
    draw_triangle(c, roof_peak_x, roof_peak_y, roof_left_x, roof_left_y, roof_right_x, roof_right_y, r, g, b)
    
    # 屋顶边框效果（稍微深一点）
    darker = (max(0, r-30), max(0, g-30), max(0, b-30))
    # 屋顶底边
    draw_line_thick(c, roof_left_x, roof_left_y, roof_right_x, roof_right_y, 2.5, *darker)
    
    # 房屋主体
    body_left = 19
    body_right = 61
    body_top = 39
    body_bottom = 68
    fill_rounded_rect(c, body_left, body_top, body_right, body_bottom, 3, r, g, b)
    
    # 门（透明挖空）
    door_left = 34
    door_right = 46
    door_top = 48
    for y in range(door_top, body_bottom + 1):
        for x in range(door_left, door_right + 1):
            i = (y * SIZE + x) * 4
            c[i] = 0; c[i+1] = 0; c[i+2] = 0; c[i+3] = 0
    
    # 门框
    draw_line_thick(c, door_left, door_top, door_left, body_bottom, 1.5, *darker)
    draw_line_thick(c, door_right, door_top, door_right, body_bottom, 1.5, *darker)
    draw_line_thick(c, door_left, door_top, door_right, door_top, 1.5, *darker)
    
    # 门把手
    fill_circle(c, 44, 58, 1.5, *darker)
    
    # 左窗户
    fill_rect(c, 23, 46, 30, 55, *darker, 200)
    fill_rect(c, 24, 47, 29, 54, r, g, b)
    
    # 右窗户
    fill_rect(c, 51, 46, 58, 55, *darker, 200)
    fill_rect(c, 52, 47, 57, 54, r, g, b)
    
    return c

def gen_course(color_rgb):
    """学习 - 书本图标"""
    c = new_canvas()
    r, g, b = color_rgb
    darker = (max(0, r-40), max(0, g-40), max(0, b-40))
    lighter = (min(255, r+50), min(255, g+50), min(255, b+50))
    
    left = 15
    right = 65
    top = 14
    bottom = 66
    
    # 书页外形（圆角矩形）
    fill_rounded_rect(c, left, top, right, bottom, 5, r, g, b)
    
    # 内页（白色/透明）
    for y in range(top+4, bottom-3):
        for x in range(left+4, right-3):
            i = (y * SIZE + x) * 4
            # 半透明内页效果
            put(c, x, y, 255, 255, 255, 220)
    
    # 书脊（中间线）
    spine = CENTER
    draw_line_thick(c, spine, top+2, spine, bottom-2, 2.5, *darker)
    
    # 左侧页码线
    for y in range(top+10, bottom-8, 9):
        draw_line_thick(c, left+8, y, spine-6, y, 1.5, *darker, 180)
    
    # 右侧页码线
    for y in range(top+10, bottom-8, 9):
        draw_line_thick(c, spine+6, y, right-8, y, 1.5, *darker, 180)
    
    # 书签丝带
    ribbon_x = right - 9
    fill_rect(c, ribbon_x, top+3, ribbon_x+3, top+18, 255, 140, 150)  # 粉色书签
    
    return c

def gen_homework(color_rgb):
    """作业 - 剪贴板图标"""
    c = new_canvas()
    r, g, b = color_rgb
    darker = (max(0, r-40), max(0, g-40), max(0, b-40))
    
    left = 16
    right = 64
    top = 13
    bottom = 69
    
    # 剪贴板主体
    fill_rounded_rect(c, left, top, right, bottom, 5, r, g, b)
    
    # 内页区域
    for y in range(top+4, bottom-3):
        for x in range(left+3, right-2):
            i = (y * SIZE + x) * 4
            put(c, x, y, 255, 255, 255, 240)
    
    # 顶部夹子
    clip_left = 29
    clip_right = 51
    clip_top = 8
    clip_bottom = 17
    fill_rounded_rect(c, clip_left, clip_top, clip_right, clip_bottom, 3, r, g, b)
    # 夹子内圈
    fill_rounded_rect(c, clip_left+3, clip_top+2, clip_right-3, clip_bottom-2, 2, 255, 255, 255)
    
    # 横线（作业线）
    line_start = top + 12
    for i, y in enumerate(range(line_start, bottom-8, 8)):
        # 勾选框
        cb_left = left + 7
        cb_top = y - 2
        cb_size = 5
        fill_rect(c, cb_left, cb_top, cb_left+cb_size, cb_top+cb_size, *darker, 200)
        put(c, cb_left+1, cb_top+1, 255, 255, 255, 240)
        put(c, cb_left+2, cb_top+2, 255, 255, 255, 240)
        put(c, cb_left+3, cb_top+3, 255, 255, 255, 240)
        
        # 横线
        line_alpha = 160 if i % 2 == 0 else 120
        draw_line_thick(c, cb_left + 9, y + 1, right - 8, y + 1, 1.2, *darker, line_alpha)
    
    return c

def gen_profile(color_rgb):
    """我的 - 用户头像图标"""
    c = new_canvas()
    r, g, b = color_rgb
    cx = CENTER
    
    # 头部（圆形）
    head_cy = 27
    head_r = 13
    fill_circle(c, cx, head_cy, head_r, r, g, b)
    
    # 身体（弧形/ shoulders）
    body_cy = 75
    body_r = 26
    for y in range(46, 70):
        for x in range(10, 70):
            dist = math.sqrt((x - cx)**2 + (y - body_cy)**2)
            if dist <= body_r:
                # 抗锯齿边缘
                if dist > body_r - 1.5:
                    alpha = int(255 * (body_r - dist) / 1.5)
                    put(c, x, y, r, g, b, max(0, alpha))
                else:
                    put(c, x, y, r, g, b, 255)
    
    # 底部平直切割
    for y in range(67, 70):
        for x in range(10, 70):
            dist = math.sqrt((x - cx)**2 + (y - body_cy)**2)
            if dist <= body_r:
                put(c, x, y, r, g, b, 255)
    
    return c

# ============ 主程序 ============

def main():
    output_dir = os.path.dirname(os.path.abspath(__file__))
    
    unsel = (154, 151, 170)  # #9A97AA
    sel = (167, 251, 245)    # #A7FBF5
    
    tasks = [
        ("tab-home.png", gen_home),
        ("tab-course.png", gen_course),
        ("tab-homework.png", gen_homework),
        ("tab-profile.png", gen_profile),
    ]
    
    for filename, gen_func in tasks:
        # 未选中
        canvas_n = gen_func(unsel)
        data = make_png(canvas_n)
        path = os.path.join(output_dir, filename)
        with open(path, 'wb') as f:
            f.write(data)
        print(f"✓ {filename} ({len(data)} bytes)")
        
        # 选中
        active_name = filename.replace('.png', '-active.png')
        canvas_a = gen_func(sel)
        data = make_png(canvas_a)
        path = os.path.join(output_dir, active_name)
        with open(path, 'wb') as f:
            f.write(data)
        print(f"✓ {active_name} ({len(data)} bytes)")
    
    print(f"\n✅ 全部完成！输出目录：{output_dir}")

if __name__ == '__main__':
    main()
