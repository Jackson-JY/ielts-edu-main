#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成科目图标"""
from PIL import Image, ImageDraw, ImageFont
import os

# 图标配置
SUBJECTS = {
    'listening': ('听力', '#A7FBF5', '#00897B'),  # 青色
    'reading': ('阅读', '#FFD4B8', '#E65100'),      # 橙色
    'writing': ('写作', '#FFE8F0', '#C2185B'),      # 粉色
    'speaking': ('口语', '#E8D4F8', '#7B1FA2'),     # 紫色
    'general': ('综合', '#D4E8FF', '#1565C0'),       # 蓝色
}

ICON_SIZE = 64
OUTPUT_DIR = '/Users/jackson/CodeBuddy/20260411151526/ielts-edu-main/ielts-edu-main/icons'

os.makedirs(OUTPUT_DIR, exist_ok=True)

def create_icon(subject_key, label, bg_color, text_color):
    """创建单个图标"""
    # 创建透明背景图片
    img = Image.new('RGBA', (ICON_SIZE, ICON_SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 画圆形背景
    padding = 4
    draw.ellipse([padding, padding, ICON_SIZE - padding, ICON_SIZE - padding], 
                 fill=bg_color)
    
    # 绘制边框
    draw.ellipse([padding, padding, ICON_SIZE - padding, ICON_SIZE - padding], 
                 outline=text_color, width=2)
    
    # 绘制图标符号
    symbols = {
        'listening': '🔊',
        'reading': '📖',
        'writing': '✏️',
        'speaking': '💬',
        'general': '📚',
    }
    symbol = symbols[subject_key]
    
    # 使用 emoji 作为图标（直接绘制文字）
    try:
        # 尝试使用系统 emoji 字体
        font_size = 32
        font = ImageFont.truetype('/System/Library/Fonts/Apple Color Emoji.ttc', font_size)
    except:
        # 如果没有 emoji 字体，使用绘制简单图形代替
        font = ImageFont.load_default()
    
    # 计算文字位置居中
    bbox = draw.textbbox((0, 0), symbol, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    x = (ICON_SIZE - text_width) // 2
    y = (ICON_SIZE - text_height) // 2 - 2
    
    draw.text((x, y), symbol, fill=text_color, font=font)
    
    # 保存
    filename = f'{OUTPUT_DIR}/icon_{subject_key}.png'
    img.save(filename)
    print(f'Created: {filename}')
    return filename

# 生成所有图标
for key, (label, bg, text) in SUBJECTS.items():
    create_icon(key, label, bg, text)

print('All icons created!')
