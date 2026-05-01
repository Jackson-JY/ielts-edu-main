#!/usr/bin/env python3
"""
Remove background from icon images using rembg
"""
import os
from rembg import remove
from PIL import Image

def remove_background(input_path, output_path):
    """Remove background from image"""
    try:
        input_image = Image.open(input_path)
        output_image = remove(input_image)
        output_image.save(output_path)
        print(f"✅ Processed: {input_path} -> {output_path}")
        return True
    except Exception as e:
        print(f"❌ Error processing {input_path}: {e}")
        return False

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    
    icons = [
        ("icon-headphones.png", "icon-headphones.png"),
        ("icon-mic.png", "icon-mic.png"),
        ("icon-book.png", "icon-book.png"),
        ("icon-pen.png", "icon-pen.png"),
    ]
    
    for input_name, output_name in icons:
        input_path = os.path.join(base_dir, input_name)
        output_path = os.path.join(base_dir, output_name)
        
        if os.path.exists(input_path):
            # Backup original
            backup_path = input_path + ".backup"
            if not os.path.exists(backup_path):
                os.rename(input_path, backup_path)
            
            # Remove background
            if remove_background(backup_path, output_path):
                print(f"   Background removed successfully!")
            else:
                # Restore backup on failure
                os.rename(backup_path, input_path)
        else:
            print(f"⚠️ File not found: {input_path}")

if __name__ == "__main__":
    main()
