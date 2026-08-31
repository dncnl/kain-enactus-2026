"""
Generates PWA icons from assets/kain-logo.png.

Two purposes, per the Web App Manifest spec:
  - "any"       icon-{size}.png            transparent bg, logo fills most of the canvas
  - "maskable"  icon-{size}-maskable.png    solid bg, logo kept inside the safe zone
                (an OS may crop a maskable icon to a circle/squircle, so content
                must stay within the centered ~80%-diameter safe zone)

Run: python scripts/generate-icons.py
"""
from PIL import Image

SRC = 'assets/kain-logo.png'
SIZES = [192, 512]
BG = (250, 249, 246, 255)  # kain-cream #FAF9F6, opaque

logo = Image.open(SRC).convert('RGBA')
lw, lh = logo.size


def fitted(logo, canvas, scale):
    """Resize logo to `scale` fraction of canvas width, preserving aspect ratio."""
    target_w = int(canvas * scale)
    target_h = int(target_w * lh / lw)
    if target_h > canvas * scale:
        target_h = int(canvas * scale)
        target_w = int(target_h * lw / lh)
    return logo.resize((target_w, target_h), Image.LANCZOS)


for size in SIZES:
    # "any" — transparent background, logo nearly fills the canvas.
    any_canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    resized = fitted(logo, size, 0.86)
    x = (size - resized.width) // 2
    y = (size - resized.height) // 2
    any_canvas.paste(resized, (x, y), resized)
    any_canvas.save(f'assets/icon-{size}.png')

    # "maskable" — opaque cream background, logo kept inside the safe zone
    # (~80% diameter circle centered on the canvas, so keep it well inside that).
    mask_canvas = Image.new('RGBA', (size, size), BG)
    resized = fitted(logo, size, 0.62)
    x = (size - resized.width) // 2
    y = (size - resized.height) // 2
    mask_canvas.paste(resized, (x, y), resized)
    mask_canvas.convert('RGB').save(f'assets/icon-{size}-maskable.png')

print('Generated:', ', '.join(f'assets/icon-{s}.png, assets/icon-{s}-maskable.png' for s in SIZES))
