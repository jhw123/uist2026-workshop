"""Generate the placeholder photos in public/stock/ (no downloads, no dependencies).

Misty's prompts promise the model a folder of stock photos named by orientation.
These are procedural landscapes that stand in for them. Run from the app folder:
    python3 scripts/make_stock.py
It writes PNGs and converts them to JPEG with macOS `sips`.
"""
import math
import random
import struct
import subprocess
import zlib
from pathlib import Path

OUT = Path("public/stock")

# sky top, sky bottom, far ridge, near ridge
SCENES = [
    ((64, 96, 150), (238, 196, 160), (92, 108, 132), (34, 52, 48)),
    ((30, 40, 88), (232, 124, 104), (70, 56, 96), (24, 22, 44)),
    ((120, 178, 216), (226, 236, 232), (112, 148, 136), (44, 88, 64)),
    ((190, 150, 120), (250, 222, 170), (196, 136, 92), (120, 70, 50)),
]


def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def ridge(width, seed, base, amp):
    rng = random.Random(seed)
    waves = [(rng.uniform(0.5, 1.5) * 2 ** i, rng.uniform(0, 6.28), 0.55 ** i) for i in range(6)]
    return [
        base + amp * sum(w * math.sin(f * x / width * 6.28 + p) for f, p, w in waves)
        for x in range(width)
    ]


def render(width, height, scene, seed):
    top, bottom, far, near = scene
    ridges = [
        (ridge(width, seed + 1, height * 0.48, height * 0.07), far),
        (ridge(width, seed + 2, height * 0.62, height * 0.06), mix(far, near, 0.5)),
        (ridge(width, seed + 3, height * 0.78, height * 0.05), near),
    ]
    rows = []
    for y in range(height):
        sky = mix(top, bottom, min(1, y / (height * 0.7)))
        row = bytearray([0])
        for x in range(width):
            colour = sky
            for line, tint in ridges:
                if y >= line[x]:
                    colour = mix(tint, near, min(1, (y - line[x]) / height))
            row.extend(colour)
        rows.append(bytes(row))
    return b"".join(rows)


def write_png(path, width, height, raw):
    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 6))
        + chunk(b"IEND", b"")
    )


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, size in (("landscape", (800, 500)), ("portrait", (500, 800))):
        for i, scene in enumerate(SCENES):
            png = OUT / f"{name}{i}.png"
            write_png(png, *size, render(*size, scene, 40 + i * 7))
            subprocess.run(
                ["sips", "-s", "format", "jpeg", str(png), "--out", str(OUT / f"{name}{i}.jpg")],
                check=True,
                capture_output=True,
            )
            png.unlink()


if __name__ == "__main__":
    main()
