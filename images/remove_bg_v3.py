#!/usr/bin/env python3
"""Remove background color from TabBar icons - final version with broader color range"""
from PIL import Image
import os

def remove_background(image_path, output_path):
    """Remove background by making purple/pink/light colors transparent"""
    img = Image.open(image_path).convert('RGBA')
    width, height = img.size
    
    # Create new image with transparent background
    new_img = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    
    for y in range(height):
        for x in range(width):
            r, g, b, a = img.getpixel((x, y))
            
            # Broader detection for background colors (light purples, pinks, lavenders)
            # Covers the range from very light to darker purple backgrounds
            is_bg = False
            
            # Light backgrounds (high RGB values)
            if r > 200 and g > 190 and b > 200:
                is_bg = True
            # Purple-ish tones (R and B higher than G)
            elif r > 180 and b > 180 and g < r and g < b:
                is_bg = True
            # Pink-ish light backgrounds
            elif r > 200 and g > 180 and b > 210:
                is_bg = True
            # Very light grays/whites with purple tint
            elif r > 220 and g > 215 and b > 225:
                is_bg = True
            
            if not is_bg:
                new_img.putpixel((x, y), (r, g, b, a))
    
    new_img.save(output_path, 'PNG')
    print(f"Processed: {output_path}")

# Process all TabBar icons
icons = [
    'tab-home.png', 'tab-home-active.png',
    'tab-course.png', 'tab-course-active.png',
    'tab-homework.png', 'tab-homework-active.png',
    'tab-profile.png', 'tab-profile-active.png'
]

for icon in icons:
    if os.path.exists(icon):
        remove_background(icon, icon)
    else:
        print(f"Not found: {icon}")

print("All icons processed!")
