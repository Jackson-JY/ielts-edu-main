#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
上传图标到云存储
"""

import os
import sys

# 图标文件列表
icons = [
    "default-avatar.png",
    "icon-book.png",
    "icon-calendar.png",
    "icon-chart.png",
    "icon-check.png",
    "icon-document.png",
    "icon-fire.png",
    "icon-headphones.png",
    "icon-mic.png",
    "icon-pause.png",
    "icon-pen.png",
    "icon-play.png",
    "icon-plus.png",
    "icon-refresh.png",
    "icon-settings.png",
    "icon-support.png",
    "icon-target.png",
    "icon-user.png",
]

source_dir = "/tmp/valid_icons"

print("请使用微信开发者工具的云存储控制台上传以下文件：")
print("=" * 60)
for icon in icons:
    source_path = os.path.join(source_dir, icon)
    if os.path.exists(source_path):
        size = os.path.getsize(source_path)
        print(f"✓ {icon} ({size} bytes)")
        print(f"  上传到: images/{icon}")
    else:
        print(f"✗ {icon} (文件不存在)")

print("=" * 60)
print(f"\n源文件目录: {source_dir}")
print("\n操作步骤:")
print("1. 打开微信开发者工具")
print("2. 点击'云开发'按钮")
print("3. 选择'存储'标签")
print("4. 创建 'images' 文件夹（如果不存在）")
print("5. 点击'上传文件'，选择上述所有 PNG 文件")
