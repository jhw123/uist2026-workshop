"""Generate placeholder 'stock photos' (gradient skies + hill silhouettes) as PNG,
then convert to JPG with macOS `sips`. Pure Python, no Pillow needed."""
import math, os, random, struct, subprocess, sys, zlib

OUT = sys.argv[1] if len(sys.argv) > 1 else "public/stock"

def png(path, w, h, px):
    raw = b"".join(b"\x00" + bytes(px[y * w * 3:(y + 1) * w * 3]) for y in range(h))
    def chunk(t, d):
        c = t + d
        return struct.pack(">I", len(d)) + c + struct.pack(">I", zlib.crc32(c) & 0xffffffff)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
                + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b""))

PALETTES = [  # sky top, sky bottom, far hills, near hills
    ((40, 70, 140), (250, 170, 110), (90, 80, 120), (40, 40, 60)),
    ((120, 180, 230), (220, 240, 250), (100, 150, 110), (50, 100, 60)),
    ((20, 20, 60), (200, 90, 120), (70, 40, 90), (25, 20, 40)),
    ((150, 200, 240), (250, 240, 210), (170, 140, 110), (110, 80, 60)),
    ((60, 120, 160), (180, 220, 220), (60, 110, 120), (20, 60, 70)),
    ((250, 200, 120), (250, 120, 80), (160, 80, 70), (80, 40, 40)),
]

def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def scene(w, h, pal, seed):
    rnd = random.Random(seed)
    top, bot, far, near = pal
    ph = [rnd.uniform(0, 6) for _ in range(6)]
    sun = (rnd.uniform(0.2, 0.8) * w, rnd.uniform(0.2, 0.45) * h, min(w, h) * 0.08)
    px = bytearray(w * h * 3)
    for x in range(w):
        u = x / w
        f = h * (0.55 + 0.08 * math.sin(u * 5 + ph[0]) + 0.04 * math.sin(u * 13 + ph[1]))
        n = h * (0.72 + 0.07 * math.sin(u * 3 + ph[2]) + 0.03 * math.sin(u * 17 + ph[3]))
        for y in range(h):
            if y > n:
                c = mix(near, (0, 0, 0), 0.4 * (y - n) / h)
            elif y > f:
                c = mix(far, near, 0.3 * (y - f) / max(1, n - f))
            else:
                c = mix(top, bot, y / f)
                d = math.hypot(x - sun[0], y - sun[1])
                if d < sun[2]:
                    c = mix(c, (255, 245, 220), 0.85)
                elif d < sun[2] * 2.5:
                    c = mix(c, (255, 235, 200), 0.3 * (1 - (d - sun[2]) / (sun[2] * 1.5)))
            i = (y * w + x) * 3
            px[i:i + 3] = bytes(c)
    return px

os.makedirs(OUT, exist_ok=True)
jobs = [("landscape", 640, 400, 6), ("portrait", 400, 600, 4), ("square", 400, 400, 4)]
for name, w, h, n in jobs:
    for i in range(n):
        p = os.path.join(OUT, f"{name}{i}.png")
        png(p, w, h, scene(w, h, PALETTES[(i * 2 + len(name)) % len(PALETTES)], name + str(i)))
        subprocess.run(["sips", "-s", "format", "jpeg", p, "--out", p[:-4] + ".jpg"], capture_output=True)
        os.remove(p)
print(sorted(os.listdir(OUT)))
