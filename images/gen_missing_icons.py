#!/usr/bin/env python3
"""
生成缺失的图标文件
"""
from PIL import Image, ImageDraw
import os

OUTPUT_DIR = "/Users/jackson/CodeBuddy/20260411151526/ielts-edu-main/ielts-edu-main/images"
SIZE = 81
COLOR = (74, 74, 74)  # #4A4A4A 深灰色

def create_target_icon():
    """目标/靶心图标"""
    img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, cy = SIZE // 2, SIZE // 2
    
    # 绘制同心圆
    for r in [30, 22, 14]:
        draw.ellipse([cx-r, cy-r, cx+r, cy+r], outline=COLOR, width=4)
    
    # 中心点
    draw.ellipse([cx-5, cy-5, cx+5, cy+5], fill=COLOR)
    return img

def create_chart_icon():
    """图表/趋势图标"""
    img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 绘制上升的折线
    points = [
        (15, 60),
        (30, 50),
        (45, 55),
        (60, 35),
        (75, 25)
    ]
    
    # 线条
    for i in range(len(points) - 1):
        draw.line([points[i], points[i+1]], fill=COLOR, width=5)
    
    # 端点圆角
    for p in points:
        r = 3
        draw.ellipse([p[0]-r, p[1]-r, p[0]+r, p[1]+r], fill=COLOR)
    
    return img

def create_calendar_icon():
    """日历图标"""
    img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 日历主体
    left, top = 15, 20
    right, bottom = 66, 65
    draw.rounded_rectangle([left, top, right, bottom], radius=4, outline=COLOR, width=4)
    
    # 顶部挂钩
    draw.line([(25, 20), (25, 10)], fill=COLOR, width=4)
    draw.line([(56, 20), (56, 10)], fill=COLOR, width=4)
    draw.ellipse([21, 6, 29, 14], outline=COLOR, width=3)
    draw.ellipse([52, 6, 60, 14], outline=COLOR, width=3)
    
    # 内部网格线
    draw.line([(left, top + 15), (right, top + 15)], fill=COLOR, width=2)
    
    return img

def create_fire_icon():
    """火焰/连续打卡图标"""
    img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 火焰形状
    cx = SIZE // 2
    base_y = 65
    
    # 外焰
    points_outer = [
        (cx, 10),      # 顶部
        (cx - 15, 35),
        (cx - 20, 50),
        (cx - 10, 65),
        (cx, 60),
        (cx + 10, 65),
        (cx + 20, 50),
        (cx + 15, 35),
    ]
    draw.polygon(points_outer, fill=COLOR)
    
    # 内焰（镂空）
    points_inner = [
        (cx, 25),
        (cx - 8, 40),
        (cx - 5, 55),
        (cx, 52),
        (cx + 5, 55),
        (cx + 8, 40),
    ]
    # 用背景色绘制内焰形成镂空效果
    draw.polygon(points_inner, fill=(0, 0, 0, 0))
    
    return img

def create_settings_icon():
    """设置/齿轮图标"""
    img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, cy = SIZE // 2, SIZE // 2
    
    # 外齿轮
    import math
    outer_points = []
    inner_points = []
    teeth = 8
    for i in range(teeth * 2):
        angle = 2 * math.pi * i / (teeth * 2) - math.pi / 2
        if i % 2 == 0:
            r = 28
        else:
            r = 22
        x = cx + r * math.cos(angle)
        y = cy + r * math.sin(angle)
        outer_points.append((x, y))
    
    draw.polygon(outer_points, fill=COLOR)
    
    # 中心圆孔
    draw.ellipse([cx-12, cy-12, cx+12, cy+12], fill=(0, 0, 0, 0))
    
    return img

def create_document_icon():
    """文档/文件图标"""
    img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 文档主体
    left, top = 18, 10
    right, bottom = 63, 71
    draw.rounded_rectangle([left, top, right, bottom], radius=3, outline=COLOR, width=4)
    
    # 折角
    draw.polygon([(right-15, top), (right, top), (right, top+15)], fill=COLOR)
    
    # 内部线条
    for y in [28, 40, 52]:
        draw.line([(left+8, y), (right-8, y)], fill=COLOR, width=3)
    
    return img

def create_user_icon():
    """用户/头像图标"""
    img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, cy = SIZE // 2, SIZE // 2
    
    # 头部圆形
    head_y = cy - 12
    draw.ellipse([cx-14, head_y-14, cx+14, head_y+14], fill=COLOR)
    
    # 身体半圆
    draw.pieslice([cx-25, cy+5, cx+25, cy+55], 0, 180, fill=COLOR)
    
    return img

def create_default_avatar():
    """默认头像"""
    img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, cy = SIZE // 2, SIZE // 2
    
    # 背景圆
    draw.ellipse([5, 5, SIZE-5, SIZE-5], fill=(200, 200, 200, 255))
    
    # 用户图标（白色）
    white = (255, 255, 255, 255)
    head_y = cy - 10
    draw.ellipse([cx-12, head_y-12, cx+12, head_y+12], fill=white)
    draw.pieslice([cx-22, cy+8, cx+22, cy+50], 0, 180, fill=white)
    
    return img

def create_trial_course():
    """试听课程封面"""
    img = Image.new('RGBA', (SIZE, SIZE), (100, 150, 255, 255))
    draw = ImageDraw.Draw(img)
    
    # 简单的课程图标
    cx, cy = SIZE // 2, SIZE // 2
    
    # 书本形状
    draw.rectangle([cx-20, cy-15, cx+20, cy+15], fill=(255, 255, 255, 200))
    draw.line([(cx, cy-15), (cx, cy+15)], fill=(100, 150, 255), width=2)
    
    return img

def main():
    icons = {
        'icon-target.png': create_target_icon,
        'icon-chart.png': create_chart_icon,
        'icon-calendar.png': create_calendar_icon,
        'icon-fire.png': create_fire_icon,
        'icon-settings.png': create_settings_icon,
        'icon-document.png': create_document_icon,
        'icon-user.png': create_user_icon,
        'default-avatar.png': create_default_avatar,
        'trial-course.png': create_trial_course,
    }
    
    for filename, create_func in icons.items():
        filepath = os.path.join(OUTPUT_DIR, filename)
        img = create_func()
        img.save(filepath, 'PNG')
        print(f"Created: {filename}")
    
    print("\n✅ All missing icons generated!")

if __name__ == '__main__':
    main()
