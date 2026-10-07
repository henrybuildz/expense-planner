#!/usr/bin/env python3
"""Regenerate the PWA PNG icons in public/icons (standard library only).

    python3 scripts/generate_icons.py

The PNGs are committed, so this only needs to run if you change the artwork.
"""
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
BG = (5, 150, 105)  # emerald-600
FG = (255, 255, 255)
BARS = [(0.25, 0.37, 0.55), (0.44, 0.56, 0.42), (0.63, 0.75, 0.28)]  # x0, x1, top
BASE = 0.72
SS = 3  # supersampling per axis for smooth edges


def in_round_rect(x, y, r):
    cx = min(max(x, r), 1 - r)
    cy = min(max(y, r), 1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def sample(x, y, rounded):
    """Return (r, g, b, a) for a point in unit space."""
    if rounded and not in_round_rect(x, y, 0.22):
        return (0, 0, 0, 0)
    for x0, x1, top in BARS:
        if x0 <= x <= x1 and top <= y <= BASE:
            return FG + (255,)
    return BG + (255,)


def render(size, rounded):
    rows = []
    for py in range(size):
        row = bytearray([0])  # PNG filter type 0
        for px in range(size):
            acc = [0, 0, 0, 0]
            for sy in range(SS):
                for sx in range(SS):
                    x = (px + (sx + 0.5) / SS) / size
                    y = (py + (sy + 0.5) / SS) / size
                    r, g, b, a = sample(x, y, rounded)
                    acc[0] += r * a
                    acc[1] += g * a
                    acc[2] += b * a
                    acc[3] += a
            n = SS * SS
            a = acc[3] / n
            if acc[3]:
                row += bytes([round(acc[0] / acc[3]), round(acc[1] / acc[3]), round(acc[2] / acc[3]), round(a)])
            else:
                row += bytes([0, 0, 0, 0])
        rows.append(bytes(row))
    return b"".join(rows)


def png(size, rounded):
    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(render(size, rounded), 9))
        + chunk(b"IEND", b"")
    )


def main():
    os.makedirs(OUT, exist_ok=True)
    targets = [
        ("icon-192.png", 192, True),
        ("icon-512.png", 512, True),
        ("maskable-512.png", 512, False),  # full-bleed; content sits inside the safe zone
        ("apple-touch-icon.png", 180, False),  # iOS rounds the corners itself
    ]
    for name, size, rounded in targets:
        with open(os.path.join(OUT, name), "wb") as f:
            f.write(png(size, rounded))
        print("wrote", name)


if __name__ == "__main__":
    main()
