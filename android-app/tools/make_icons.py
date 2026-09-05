#!/usr/bin/env python3
import struct, zlib, os

def chunk(tag, data):
    c = struct.pack(">I", len(data)) + tag + data
    c += struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    return c

def png(path, size, rgba):
    def row():
        return b"\x00" + bytes(rgba) * size
    raw = b"".join(row() for _ in range(size))
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", zlib.compress(raw, 9)))
        f.write(chunk(b"IEND", b""))

# Brand dark-green tile (#10241B); a lighter green check sits in the center.
def pixel(x, y, size):
    cx, cy = size * 0.5, size * 0.5
    r = size * 0.28
    d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
    if d <= r:
        return (15, 157, 88, 255)
    return (16, 36, 27, 255)

sizes = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
base = os.path.join(os.path.dirname(__file__))
for dpi, size in sizes.items():
    for name in ("ic_launcher", "ic_launcher_round"):
        outdir = os.path.join(base, "..", "app", "src", "main", "res", "mipmap-" + dpi)
        os.makedirs(outdir, exist_ok=True)
        p = os.path.join(outdir, name + ".png")
        if name.endswith("round"):
            data = []
            cx = cy = size / 2.0
            for y in range(size):
                row = []
                for x in range(size):
                    if ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 <= size / 2.0:
                        row.append(pixel(x, y, size))
                    else:
                        row.append((0, 0, 0, 0))
                data.append(row)
            raw = b"".join(b"\x00" + bytes(q) for row in data for q in row)
            ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
            with open(p, "wb") as f:
                f.write(b"\x89PNG\r\n\x1a\n")
                f.write(chunk(b"IHDR", ihdr))
                f.write(chunk(b"IDAT", zlib.compress(raw, 9)))
                f.write(chunk(b"IEND", b""))
        else:
            png(p, size, None) if False else None
            # square with shield dot
            raw = b"".join(b"\x00" + bytes(pixel(x, y, size)) for y in range(size) for x in range(size))
            ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
            with open(p, "wb") as f:
                f.write(b"\x89PNG\r\n\x1a\n")
                f.write(chunk(b"IHDR", ihdr))
                f.write(chunk(b"IDAT", zlib.compress(raw, 9)))
                f.write(chunk(b"IEND", b""))
        print("wrote", p)