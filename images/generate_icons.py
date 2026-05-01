#!/usr/bin/env python3
"""生成最小化PNG Tab图标 - 无需任何第三方库"""
import struct
import zlib
import os

SIZE = 81
OUT_DIR = os.path.dirname(os.path.abspath(__file__))

def make_png(draw_func, color, filepath):
    """生成81x81像素的PNG文件"""
    r = int(color[1:3], 16)
    g = int(color[3:5], 16)
    b = int(color[5:7], 16)
    
    # 构建原始像素数据
    raw = bytearray()
    for y in range(SIZE):
        raw.append(0)  # filter byte
        for x in range(SIZE):
            if draw_func(x, y, SIZE):
                raw.extend([r, g, b, 255])  # 有颜色，不透明
            else:
                raw.extend([0, 0, 0, 0])  # 透明
    
    # 压缩
    compressed = zlib.compress(bytes(raw), 9)
    
    # 写PNG文件
    with open(filepath, 'wb') as f:
        # PNG签名
        f.write(b'\x89PNG\r\n\x1a\n')
        # IHDR
        ihdr = struct.pack('>IIBBBBB', SIZE, SIZE, 8, 6, 0, 0, 0)
        write_chunk(f, b'IHDR', ihdr)
        # IDAT
        write_chunk(f, b'IDAT', compressed)
        # IEND
        write_chunk(f, b'IEND', b'')
    
    size = os.path.getsize(filepath)
    print(f'  ✓ {os.path.basename(filepath)} ({size} bytes)')

def write_chunk(f, chunk_type, data):
    """写一个PNG chunk"""
    f.write(struct.pack('>I', len(data)))
    f.write(chunk_type)
    f.write(data)
    crc = zlib.crc32(chunk_type + data) & 0xFFFFFFFF
    f.write(struct.pack('>I', crc))

# ===== 图标形状函数 =====
def draw_home(x, y, s):
    """房屋：三角形屋顶+方形底座"""
    cx, cy = s/2, s/2
    # 屋顶三角形
    roof_top = s * 0.15
    roof_bot = s * 0.48
    roof_left = s * 0.12
    roof_right = s * 0.88
    
    in_roof = (y >= roof_top and y <= roof_bot and
               x >= cx - (roof_right - cx) * (y - roof_top) / (roof_bot - roof_top) and
               x <= cx + (cx - roof_left) * (y - roof_top) / (roof_bot - roof_top))
    
    # 房屋身体
    body_top = s * 0.48
    body_bot = s * 0.82
    body_left = s * 0.22
    body_right = s * 0.78
    in_body = (y >= body_top and y <= body_bot and
               x >= body_left and x <= body_right)
    
    # 门
    door_left = s * 0.40
    door_right = s * 0.60
    door_top = s * 0.60
    in_door = (y >= door_top and y <= body_bot and
               x >= door_left and x <= door_right)
    
    return (in_roof or in_body) and not in_door

def draw_course(x, y, s):
    """打开的书：两个对称梯形"""
    left = s * 0.13
    right = s * 0.87
    top = s * 0.18
    bot = s * 0.82
    mid = s * 0.50
    
    if y < top or y > bot:
        return False
    if x < left or x > right:
        return False
    
    # 左边页面
    y_frac = (y - top) / (bot - top)
    left_edge = left + (mid - left) * abs(y_frac - 0.5) * 0.3
    in_left = x >= left_edge and x <= mid
    
    # 右边页面
    right_edge = right - (right - mid) * abs(y_frac - 0.5) * 0.3
    in_right = x >= mid and x <= right_edge
    
    return in_left or in_right

def draw_homework(x, y, s):
    """铅笔：修长菱形+笔尖"""
    cx, cy = s/2, s/2
    # 铅笔主体（菱形）
    half_w = s * 0.12
    half_h = s * 0.38
    
    norm_x = abs(x - cx) / half_w
    norm_y = abs(y - cy) / half_h
    
    in_body = (norm_x + norm_y) <= 1 and y <= s * 0.80
    
    # 笔尖（三角形）
    tip_top = s * 0.80
    tip_bot = s * 0.92
    tip_half_w = s * 0.06
    
    in_tip = (y >= tip_top and y <= tip_bot and
              abs(x - cx) <= tip_half_w * (tip_bot - y) / (tip_bot - tip_top))
    
    return in_body or in_tip

def draw_profile(x, y, s):
    """人物：圆形头+弧形身体"""
    cx, cy = s/2, s/2
    # 头
    head_cx, head_cy = cx, s * 0.32
    head_r = s * 0.16
    dx = x - head_cx
    dy = y - head_cy
    in_head = (dx*dx + dy*dy) <= (head_r * head_r)
    
    # 身体（椭圆）
    body_cy = s * 0.80
    body_rx = s * 0.28
    body_ry = s * 0.22
    dx2 = x - cx
    dy2 = y - body_cy
    in_body = (dx2*dx2)/(body_rx*body_rx) + (dy2*dy2)/(body_ry*body_ry) <= 1
    
    return in_head or in_body

# ===== 主程序 =====
ICONS = [
    ('home',      draw_home,     'tab-home.png'),
    ('home-active', draw_home,   'tab-home-active.png'),
    ('course',    draw_course,   'tab-course.png'),
    ('course-active', draw_course, 'tab-course-active.png'),
    ('homework',  draw_homework, 'tab-homework.png'),
    ('homework-active', draw_homework, 'tab-homework-active.png'),
    ('profile',   draw_profile,  'tab-profile.png'),
    ('profile-active', draw_profile, 'tab-profile-active.png'),
]

# 颜色配置
COLORS = {
    'normal': '#9A97AA',   # 未选中：灰色
    'active': '#4A4A4A',   # 选中：深灰
}

print('Generating tab icons...')
print(f'Output directory: {OUT_DIR}\n')

for name, func, filename in ICONS:
    state = 'active' if 'active' in name else 'normal'
    color = COLORS[state]
    filepath = os.path.join(OUT_DIR, filename)
    make_png(func, color, filepath)

print('\n✅ All icons generated successfully!')
print('Verify file sizes with: ls -lh *.png')
