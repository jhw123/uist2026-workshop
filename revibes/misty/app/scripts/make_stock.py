"""Generate the stock photos Misty's prompts refer to (/stock/landscape0.jpg, ...).

The paper's prompts tell the model to use "a few stock photos under the folder
/stock/, named after their orientation". The paper does not include the photos,
so this script paints simple scenic images (sky, sun, hills, lake, trees) with
Pillow. Run from the app folder:  python3 scripts/make_stock.py
"""
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / "public" / "stock"
OUT.mkdir(parents=True, exist_ok=True)

PALETTES = [
    # sky top, sky bottom, sun, far hills, near hills, ground/water
    ((40, 70, 140), (250, 180, 120), (255, 230, 170), (90, 80, 130), (50, 60, 90), (30, 40, 60)),
    ((90, 160, 230), (200, 230, 250), (255, 250, 220), (110, 150, 130), (60, 110, 70), (40, 80, 50)),
    ((20, 20, 60), (120, 60, 120), (250, 200, 220), (70, 50, 100), (40, 30, 70), (20, 20, 40)),
    ((120, 190, 230), (240, 240, 220), (255, 255, 240), (170, 160, 140), (130, 110, 90), (90, 150, 190)),
    ((250, 140, 90), (255, 220, 160), (255, 245, 200), (160, 90, 80), (110, 60, 60), (70, 40, 40)),
    ((60, 120, 120), (190, 220, 200), (250, 250, 230), (80, 120, 100), (40, 80, 70), (30, 60, 60)),
]


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def ridge(w, h, base, amp, seed, rough=6):
    rnd = random.Random(seed)
    phases = [rnd.random() * math.tau for _ in range(rough)]
    pts = []
    for x in range(0, w + 8, 8):
        y = base
        for k in range(rough):
            y += amp / (k + 1) * math.sin(x / w * math.tau * (k + 1) * 0.7 + phases[k])
        pts.append((x, y))
    return pts + [(w, h), (0, h)]


def paint(w, h, pal, seed, kind):
    sky_t, sky_b, sun, far, near, ground = pal
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    horizon = int(h * (0.62 if kind != "portrait" else 0.55))
    for y in range(h):
        d.line([(0, y), (w, y)], fill=lerp(sky_t, sky_b, min(1, y / horizon)))
    rnd = random.Random(seed)
    sx, sy, r = int(w * rnd.uniform(0.2, 0.8)), int(horizon * rnd.uniform(0.35, 0.7)), int(min(w, h) * 0.08)
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([sx - r * 3, sy - r * 3, sx + r * 3, sy + r * 3], fill=sun + (70,))
    glow = glow.filter(ImageFilter.GaussianBlur(r))
    img.paste(glow, (0, 0), glow)
    d = ImageDraw.Draw(img)
    d.ellipse([sx - r, sy - r, sx + r, sy + r], fill=sun)
    d.polygon(ridge(w, h, horizon - h * 0.12, h * 0.08, seed + 1), fill=lerp(far, sky_b, 0.35))
    d.polygon(ridge(w, h, horizon - h * 0.04, h * 0.06, seed + 2), fill=far)
    d.polygon(ridge(w, h, horizon + h * 0.05, h * 0.05, seed + 3, 4), fill=near)
    if seed % 2 == 0:  # lake with a reflection band
        top = int(horizon + h * 0.12)
        for y in range(top, h):
            d.line([(0, y), (w, y)], fill=lerp(lerp(ground, sky_b, 0.5), ground, (y - top) / max(1, h - top)))
        d.rectangle([sx - r, top + 4, sx + r, top + 8], fill=lerp(sun, ground, 0.3))
    else:  # trees in the foreground
        for i in range(int(w / 28)):
            tx = rnd.randint(0, w)
            th = rnd.randint(int(h * 0.12), int(h * 0.3))
            ty = h - rnd.randint(0, int(h * 0.08))
            tw = th // 4
            d.polygon([(tx, ty - th), (tx - tw, ty), (tx + tw, ty)], fill=lerp(ground, (0, 0, 0), 0.25))
    return img.filter(ImageFilter.SMOOTH)


SIZES = {"landscape": (1200, 800), "portrait": (800, 1200), "square": (900, 900)}
COUNTS = {"landscape": 6, "portrait": 4, "square": 4}

n = 0
for kind, (w, h) in SIZES.items():
    for i in range(COUNTS[kind]):
        img = paint(w, h, PALETTES[(n * 5 + i) % len(PALETTES)], seed=n * 7 + i, kind=kind)
        img.save(OUT / f"{kind}{i}.jpg", quality=82)
        n += 1
print("wrote", n, "images to", OUT)
