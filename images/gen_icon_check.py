#!/usr/bin/env python3
"""
生成勾选图标 (icon-check.png)
使用 PIL 库生成绿色勾选标记
"""

from PIL import Image, ImageDraw
import os

def create_check_icon(size=81, color=(74, 74, 74)):
    """创建勾选图标 - 风格与其他图标一致（深灰色、圆角）"""
    # 创建透明背景
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 计算勾选形状的点 - 更粗的线条，圆角端点
    # 第一段：从左下到中间
    x1, y1 = int(size * 0.22), int(size * 0.55)
    x2, y2 = int(size * 0.42), int(size * 0.72)
    # 第二段：从中间到右上
    x3, y3 = int(size * 0.78), int(size * 0.28)
    
    # 线宽 - 与其他图标一致，更粗
    line_width = max(10, int(size * 0.22))
    
    # 绘制圆角线条的辅助函数
    def draw_round_line(draw, x1, y1, x2, y2, fill, width):
        draw.line([(x1, y1), (x2, y2)], fill=fill, width=width)
        # 两端圆角
        radius = width // 2
        draw.ellipse([x1-radius, y1-radius, x1+radius, y1+radius], fill=fill)
        draw.ellipse([x2-radius, y2-radius, x2+radius, y2+radius], fill=fill)
    
    # 绘制勾选（两段线）
    draw_round_line(draw, x1, y1, x2, y2, color, line_width)
    draw_round_line(draw, x2, y2, x3, y3, color, line_width)
    
    return img

def main():
    # 获取脚本所在目录
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(script_dir, 'icon-check.png')
    
    # 生成图标
    img = create_check_icon(size=81, color=(76, 175, 80))  # #4CAF50 绿色
    
    # 保存
    img.save(output_path, 'PNG')
    print(f"Created: {output_path}")
    
    # 显示文件大小
    file_size = os.path.getsize(output_path)
    print(f"File size: {file_size} bytes")
    print("\n✅ Check icon generated successfully!")

if __name__ == '__main__':
    main()
