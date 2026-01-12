#!/usr/bin/env python3
from __future__ import annotations
import os, zlib, struct, math
from typing import Tuple, List


def write_png_rgba(path: str, width: int, height: int, pixels: List[Tuple[int,int,int,int]]):
    # PNG signature
    sig = b"\x89PNG\r\n\x1a\n"

    def chunk(typ: bytes, data: bytes) -> bytes:
        return struct.pack(
            ">I", len(data)
        ) + typ + data + struct.pack(
            ">I", zlib.crc32(typ + data) & 0xFFFFFFFF
        )

    # IHDR
    ihdr = struct.pack(
        ">IIBBBBB",
        width,
        height,
        8,    # bit depth
        6,    # color type RGBA
        0,    # compression
        0,    # filter
        0,    # interlace
    )

    # IDAT: add filter byte 0 per scanline
    raw = bytearray()
    rowlen = width * 4
    for y in range(height):
        raw.append(0)  # filter type 0
        row = pixels[y*width:(y+1)*width]
        for (r,g,b,a) in row:
            raw += bytes((r,g,b,a))
    comp = zlib.compress(bytes(raw), 9)

    # IEND
    with open(path, "wb") as f:
        f.write(sig)
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", comp))
        f.write(chunk(b"IEND", b""))


def inside_triangle(px: float, py: float, a, b, c) -> bool:
    # Barycentric technique
    (x1,y1),(x2,y2),(x3,y3) = a,b,c
    denom = (y2 - y3)*(x1 - x3) + (x3 - x2)*(y1 - y3)
    if denom == 0:
        return False
    u = ((y2 - y3)*(px - x3) + (x3 - x2)*(py - y3)) / denom
    v = ((y3 - y1)*(px - x3) + (x1 - x3)*(py - y3)) / denom
    w = 1 - u - v
    return (u >= 0) and (v >= 0) and (w >= 0)


def draw_pyramid(size: int) -> List[Tuple[int,int,int,int]]:
    n = size
    # Transparent background
    pixels = [(0,0,0,0)] * (n*n)

    # Coordinates
    apex = (n*0.5, n*0.2)
    bl = (n*0.18, n*0.84)
    br = (n*0.82, n*0.84)
    mid = ((bl[0]+br[0])/2.0, (bl[1]+br[1])/2.0)

    # Colors (golden shades)
    gold_light = (240, 198, 83, 255)
    gold_mid   = (224, 178, 76, 255)
    gold_dark  = (187, 139, 40, 255)
    outline    = (120, 90, 28, 255)

    # Faces: left and right
    left_tri = (apex, bl, mid)
    right_tri = (apex, mid, br)

    # Simple shadow under base (soft alpha)
    shadow_y = int(n*0.88)
    for y in range(min(n-1, shadow_y), min(n, shadow_y+2)):
        for x in range(int(n*0.22), int(n*0.78)):
            idx = y*n + x
            pixels[idx] = (0,0,0,40)

    # Fill triangles with simple left-right gradient
    for y in range(n):
        for x in range(n):
            # sample at pixel center for better edges
            fx, fy = x+0.5, y+0.5
            if inside_triangle(fx, fy, *left_tri):
                t = (fx - bl[0]) / max(1.0, (mid[0]-bl[0]))
                t = min(max(t, 0.0), 1.0)
                # lerp dark -> mid
                r = int(gold_dark[0]*(1-t) + gold_mid[0]*t)
                g = int(gold_dark[1]*(1-t) + gold_mid[1]*t)
                b = int(gold_dark[2]*(1-t) + gold_mid[2]*t)
                pixels[y*n+x] = (r,g,b,255)
            elif inside_triangle(fx, fy, *right_tri):
                t = (fx - mid[0]) / max(1.0, (br[0]-mid[0]))
                t = min(max(t, 0.0), 1.0)
                # lerp mid -> light
                r = int(gold_mid[0]*(1-t) + gold_light[0]*t)
                g = int(gold_mid[1]*(1-t) + gold_light[1]*t)
                b = int(gold_mid[2]*(1-t) + gold_light[2]*t)
                pixels[y*n+x] = (r,g,b,255)

    # Outline pyramid edges (simple 1px)
    def draw_line(p1, p2, col):
        (x1,y1),(x2,y2) = p1,p2
        steps = int(max(abs(x2-x1), abs(y2-y1)))
        if steps <= 0:
            return
        for i in range(steps+1):
            t = i/steps
            xx = int(round(x1 + (x2-x1)*t))
            yy = int(round(y1 + (y2-y1)*t))
            if 0 <= xx < n and 0 <= yy < n:
                pixels[yy*n+xx] = col

    draw_line(apex, bl, outline)
    draw_line(apex, br, outline)
    draw_line(bl, br, outline)
    draw_line(apex, mid, outline)

    return pixels


def main():
    out_dir = os.path.join(os.path.dirname(__file__), 'icons')
    os.makedirs(out_dir, exist_ok=True)
    sizes = [16, 32, 48, 128]
    for s in sizes:
        px = draw_pyramid(s)
        path = os.path.join(out_dir, f'icon{s}.png')
        write_png_rgba(path, s, s, px)
    print('Generated icons at', out_dir)


if __name__ == '__main__':
    main()

