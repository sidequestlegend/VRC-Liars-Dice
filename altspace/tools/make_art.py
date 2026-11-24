# Makes the port's own art for the liars-dice kit (run with Python 3, Pillow, NumPy and OpenCV):
#
#   python altspace/tools/make_art.py
#
#   Assets/Kit/Art/dice_atlas.png   upstream's "all dice.png" (MIT) with its two lettered frames drawn again:
#                                   frame 8, the "LIAR'S DICE" logo, was lettered in Heavitas (personal-use only), and
#                                   frame 6's "?" in a font nobody named. Both are now Archivo Black (SIL OFL 1.1).
#   Assets/Kit/Art/wild.png         the "ones are wild" icon on the face-1 button (upstream's teeth.png has no stated
#                                   origin): a star with a "1", drawn here.
#
# Inputs: the fork's own Assets/LiarsDice/Art Assets/Textures/all dice.png and Assets/Kit/Fonts/ArchivoBlack-Regular.ttf.
import os
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
REPO = os.path.dirname(PROJECT)
ATLAS_IN = os.path.join(REPO, "Assets", "LiarsDice", "Art Assets", "Textures", "all dice.png")
FONT = os.path.join(PROJECT, "Assets", "Kit", "Fonts", "ArchivoBlack-Regular.ttf")
OUT = os.path.join(PROJECT, "Assets", "Kit", "Art")


def cell_box(frame, size):
    """Pixel box (x0, y0, x1, y1) of flipbook frame n in a 3 x 3 atlas: frames 0-2 on the top row of the image."""
    col, row = frame % 3, frame // 3
    c = size / 3.0
    return int(round(col * c)), int(round(row * c)), int(round((col + 1) * c)), int(round((row + 1) * c))


def text_centered(draw, box, lines, font, fill, stroke=0, stroke_fill=None, spacing=0.12):
    x0, y0, x1, y1 = box
    heights, widths = [], []
    for line in lines:
        l, t, r, b = draw.textbbox((0, 0), line, font=font, stroke_width=stroke)
        widths.append(r - l)
        heights.append(b - t)
    gap = int(font.size * spacing)
    total = sum(heights) + gap * (len(lines) - 1)
    y = (y0 + y1) / 2 - total / 2
    for line, w, h in zip(lines, widths, heights):
        l, t, r, b = draw.textbbox((0, 0), line, font=font, stroke_width=stroke)
        x = (x0 + x1) / 2 - w / 2 - l
        draw.text((x, y - t), line, font=font, fill=fill, stroke_width=stroke, stroke_fill=stroke_fill)
        y += h + gap


def atlas():
    im = Image.open(ATLAS_IN).convert("RGB")
    size = im.size[0]
    a = np.array(im)

    # Frame 6: take the old "?" out (inpainted from the die's own shading around it), then letter a new one.
    x0, y0, x1, y1 = cell_box(6, size)
    cell = a[y0:y1, x0:x1].copy()
    grey = cv2.cvtColor(cell, cv2.COLOR_RGB2GRAY)
    mask = (grey < 235).astype(np.uint8) * 255
    # keep the die's soft edge: only the glyph, well inside the cell
    inner = np.zeros_like(mask)
    m = int((x1 - x0) * 0.18)
    inner[m:-m, m:-m] = 255
    mask = cv2.bitwise_and(mask, inner)
    mask = cv2.dilate(mask, np.ones((9, 9), np.uint8), iterations=2)
    cell = cv2.inpaint(cell, mask, 12, cv2.INPAINT_TELEA)
    a[y0:y1, x0:x1] = cell

    # Frame 8: the logo cell, white, lettered again.
    x0, y0, x1, y1 = cell_box(8, size)
    a[y0:y1, x0:x1] = 255

    im = Image.fromarray(a)
    draw = ImageDraw.Draw(im)
    w = cell_box(6, size)[2] - cell_box(6, size)[0]
    question = ImageFont.truetype(FONT, int(w * 0.52))
    text_centered(draw, cell_box(6, size), ["?"], question, fill=(0, 0, 0))
    logo = ImageFont.truetype(FONT, int(w * 0.215))
    text_centered(draw, cell_box(8, size), ["LIAR'S", "DICE"], logo, fill=(255, 255, 255), stroke=int(w * 0.022), stroke_fill=(0, 0, 0))
    os.makedirs(OUT, exist_ok=True)
    im.save(os.path.join(OUT, "dice_atlas.png"), optimize=True)


def wild():
    n = 256
    im = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    c = n / 2
    pts = []
    for i in range(10):
        r = n * (0.47 if i % 2 == 0 else 0.21)
        ang = -np.pi / 2 + i * np.pi / 5
        pts.append((c + r * np.cos(ang), c + 8 + r * np.sin(ang)))
    draw.polygon(pts, fill=(255, 196, 0, 255), outline=(60, 30, 0, 255), width=7)
    font = ImageFont.truetype(FONT, int(n * 0.36))
    text_centered(draw, (0, 14, n, n), ["1"], font, fill=(60, 30, 0, 255))
    im.save(os.path.join(OUT, "wild.png"), optimize=True)


if __name__ == "__main__":
    for path in (ATLAS_IN, FONT):
        if not os.path.exists(path):
            sys.exit(f"missing input: {path}")
    atlas()
    wild()
    print("wrote", os.path.join(OUT, "dice_atlas.png"), "and wild.png")
