#!/usr/bin/env python3
"""Generate the PWA icon set (pure stdlib — no PIL).

Design: teal rounded square, white compass ring, red-tipped north needle.
Outputs product/public/icons/{icon-192,icon-512,icon-maskable-512,apple-touch-icon}.png
"""
import math, os, struct, zlib

TEAL = (13, 148, 136)     # tailwind teal-600 — the app accent
DARK = (7, 89, 80)        # ring shadow
WHITE = (250, 250, 250)
RED = (220, 68, 68)

def px(size, maskable):
    c = size / 2
    # maskable icons need ~80% safe zone → shrink art, full-bleed background
    art = 0.34 if maskable else 0.40
    ring_r = size * art
    ring_w = size * 0.045
    needle_l = ring_r * 0.78
    needle_hw = size * 0.055
    corner = 0 if maskable else size * 0.18
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            dx, dy = x - c, y - c
            d = math.hypot(dx, dy)
            # rounded-rect alpha
            if corner:
                qx, qy = abs(dx) - (c - corner), abs(dy) - (c - corner)
                out = math.hypot(max(qx, 0), max(qy, 0)) - corner
                a = 0 if out > 0.5 else 255
            else:
                a = 255
            r, g, b = TEAL
            if a:
                # subtle radial shade
                sh = 1 - 0.25 * (d / c) ** 2
                r, g, b = [int(v * sh) for v in TEAL]
                # compass ring
                rd = abs(d - ring_r)
                if rd < ring_w:
                    t = 1 - rd / ring_w
                    wr, wg, wb = WHITE
                    r = int(r + (wr - r) * min(1, t * 1.6))
                    g = int(g + (wg - g) * min(1, t * 1.6))
                    b = int(b + (wb - b) * min(1, t * 1.6))
                # needle: two triangles along vertical axis
                if d < ring_r * 0.92:
                    # north (up) — red tip; south — white
                    for (sign, col) in ((-1, RED), (1, WHITE)):
                        ty = dy * sign  # ty>0 in this needle's half
                        if 0 <= ty <= needle_l:
                            hw = needle_hw * (1 - ty / needle_l)
                            if abs(dx) <= hw:
                                r, g, b = col
                # hub
                if d < size * 0.035:
                    r, g, b = WHITE
            row += bytes((r, g, b, a))
        rows.append(bytes(row))
    return rows

def write_png(path, size, maskable=False):
    rows = px(size, maskable)
    raw = b"".join(b"\x00" + r for r in rows)
    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw, 9))
           + chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(png)
    print(f"{path}: {size}x{size}{' maskable' if maskable else ''} ({len(png)} bytes)")

out = os.path.join(os.path.dirname(__file__), "..", "product", "public", "icons")
os.makedirs(out, exist_ok=True)
write_png(os.path.join(out, "icon-192.png"), 192)
write_png(os.path.join(out, "icon-512.png"), 512)
write_png(os.path.join(out, "icon-maskable-512.png"), 512, maskable=True)
write_png(os.path.join(out, "apple-touch-icon.png"), 180, maskable=True)
