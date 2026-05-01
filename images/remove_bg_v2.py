#!/usr/bin/env python3
"""Remove background color from TabBar icons - improved version"""
from PIL import Image
import os

def remove_background(image_path, output_path):
    """Remove background by making light purple/pink colors transparent"""
    img = Image.open(image_path).convert('RGBA')
    width, height = img.size
    
    # Create new image with transparent background
    new_img = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    
    for y in range(height):
        for x in range(width):
            r, g, b, a = img.getpixel((x, y))
            
            # Check if pixel is in the background color range (light purple/pink)
            # The background is around RGB(220-240, 210-230, 230-245)
            is_bg = (
                r > 210 and g > 200 and b > 220  # Light colors
                and abs(r - b) < 25  # Purple-ish (R and B are similar)
                and g < r  # Green is lower than red (purple characteristic)
                and g < b  # Green is lower than blue
            )
            
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
