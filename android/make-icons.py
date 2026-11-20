"""The Android app's launcher icons and splash image, from the desktop app's icon (build/icon.png).

  python3 android/make-icons.py
"""
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
RES = os.path.join(HERE, 'twa', 'app', 'src', 'main', 'res')
icon = Image.open(os.path.join(HERE, '..', 'build', 'icon.png')).convert('RGBA')
for density, size in (('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)):
    folder = os.path.join(RES, f'mipmap-{density}')
    os.makedirs(folder, exist_ok=True)
    icon.resize((size, size), Image.LANCZOS).save(os.path.join(folder, 'ic_launcher.png'), optimize=True)
icon.resize((512, 512), Image.LANCZOS).save(os.path.join(RES, 'drawable', 'splash.png'), optimize=True)
print('icons written')
