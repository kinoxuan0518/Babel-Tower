#!/usr/bin/env python3
from __future__ import annotations
import os, zlib, struct
from typing import Tuple, List


def write_png_rgba(path: str, width: int, height: int, pixels: List[Tuple[int,int,int,int]]):
    sig = b"\x89PNG\r\n\x1a\n"
    def chunk(typ: bytes, data: bytes) -> bytes:
        return struct.pack(
            ">I", len(data)
        ) + typ + data + struct.pack(
            ">I", zlib.crc32(typ + data) & 0xFFFFFFFF
        )
    ihdr = struct.pack(
        ">IIBBBBB", width, height, 8, 6, 0, 0, 0
    )
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        for (r,g,b,a) in pixels[y*width:(y+1)*width]:
            raw += bytes((r,g,b,a))
    comp = zlib.compress(bytes(raw), 9)
    with open(path, "wb") as f:
        f.write(sig)
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", comp))
        f.write(chunk(b"IEND", b""))


def clamp(x, lo, hi):
    return lo if x < lo else hi if x > hi else x


def lerp(a: Tuple[int,int,int,int], b: Tuple[int,int,int,int], t: float):
    t = clamp(t, 0.0, 1.0)
    return (
        int(a[0]*(1-t) + b[0]*t),
        int(a[1]*(1-t) + b[1]*t),
        int(a[2]*(1-t) + b[2]*t),
        int(a[3]*(1-t) + b[3]*t),
    )


def draw_line(pixels, n, p1, p2, col):
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


def fill_rect_grad(pixels, n, x0, y0, w, h, left_col, right_col):
    for yy in range(int(y0), int(y0+h)):
        if 0 <= yy < n:
            for xx in range(int(x0), int(x0+w)):
                if 0 <= xx < n:
                    t = (xx - x0) / max(1.0, w-1)
                    pixels[yy*n+xx] = lerp(left_col, right_col, t)


def fill_rect(pixels, n, x0, y0, w, h, col):
    for yy in range(int(y0), int(y0+h)):
        if 0 <= yy < n:
            for xx in range(int(x0), int(x0+w)):
                if 0 <= xx < n:
                    pixels[yy*n+xx] = col


def inside_triangle(px: float, py: float, a, b, c) -> bool:
    (x1,y1),(x2,y2),(x3,y3) = a,b,c
    denom = (y2 - y3)*(x1 - x3) + (x3 - x2)*(y1 - y3)
    if denom == 0:
        return False
    u = ((y2 - y3)*(px - x3) + (x3 - x2)*(py - y3)) / denom
    v = ((y3 - y1)*(px - x3) + (x1 - x3)*(py - y3)) / denom
    w = 1 - u - v
    return (u >= 0) and (v >= 0) and (w >= 0)


def fill_triangle(pixels, n, a, b, c, col_left, col_right):
    minx = int(max(0, min(a[0],b[0],c[0])))
    maxx = int(min(n-1, max(a[0],b[0],c[0])))
    miny = int(max(0, min(a[1],b[1],c[1])))
    maxy = int(min(n-1, max(a[1],b[1],c[1])))
    x0 = minx
    w = max(1, maxx - minx + 1)
    for yy in range(miny, maxy+1):
        for xx in range(minx, maxx+1):
            if inside_triangle(xx+0.5, yy+0.5, a,b,c):
                t = (xx - x0) / w
                pixels[yy*n+xx] = lerp(col_left, col_right, t)


def draw_tower(size: int) -> List[Tuple[int,int,int,int]]:
    n = size
    pixels = [(0,0,0,0)] * (n*n)

    # Palette (sandstone/gold-ish tower)
    L = (242, 206, 110, 255)   # light
    M = (224, 178, 76, 255)    # mid
    D = (181, 136, 45, 255)    # dark
    O = (120, 90, 28, 255)     # outline
    WIN = (80, 64, 32, 200)    # window
    SH = (0, 0, 0, 40)         # shadow

    cx = n*0.5
    y = n*0.18

    tiers = [
        (0.60, 0.16),
        (0.50, 0.14),
        (0.40, 0.12),
        (0.32, 0.11),
    ]

    # Base plinth
    base_w, base_h = 0.70, 0.10
    x0 = cx - n*base_w*0.5
    fill_rect_grad(pixels, n, x0, n*0.80, n*base_w, n*base_h, D, M)
    draw_line(pixels, n, (int(x0), int(n*0.80)), (int(x0 + n*base_w), int(n*0.80)), O)
    draw_line(pixels, n, (int(x0), int(n*0.80 + n*base_h)), (int(x0 + n*base_w), int(n*0.80 + n*base_h)), O)

    # Soft shadow under base
    for yy in range(int(n*0.92), min(n, int(n*0.94))):
        for xx in range(int(cx - n*0.33), int(cx + n*0.33)):
            if 0 <= xx < n and 0 <= yy < n:
                pixels[yy*n+xx] = SH

    # Draw tiers (tapering rectangles)
    for w_ratio, h_ratio in tiers:
        w = n*w_ratio
        h = n*h_ratio
        x = cx - w/2
        fill_rect_grad(pixels, n, x, y, w, h, M, L)
        # outline
        draw_line(pixels, n, (int(x), int(y)), (int(x+w), int(y)), O)
        draw_line(pixels, n, (int(x), int(y+h)), (int(x+w), int(y+h)), O)
        draw_line(pixels, n, (int(x), int(y)), (int(x), int(y+h)), O)
        draw_line(pixels, n, (int(x+w), int(y)), (int(x+w), int(y+h)), O)

        # windows: scale with size
        cols = max(1, int(w // (n*0.12)))
        rows = 1 if n <= 24 else 2
        margin_x = w*0.08
        margin_y = h*0.25
        win_w = max(1, int(w*0.06))
        win_h = max(1, int(h*0.30))
        if cols > 6: cols = 6
        for r in range(rows):
            for c in range(cols):
                cxp = x + margin_x + c * ((w - 2*margin_x) / max(1, cols-1))
                cyp = y + margin_y + r * (h - 2*margin_y)
                for yy in range(int(cyp), int(cyp + win_h)):
                    if 0 <= yy < n:
                        for xx in range(int(cxp), int(cxp + win_w)):
                            if 0 <= xx < n:
                                pixels[yy*n+xx] = WIN
        y += h - n*0.01  # slight overlap to avoid gaps

    # Spire block
    sp_w = n*0.22
    sp_h = n*0.16
    sp_x = cx - sp_w/2
    fill_rect_grad(pixels, n, sp_x, y, sp_w, sp_h, M, L)
    draw_line(pixels, n, (int(sp_x), int(y)), (int(sp_x+sp_w), int(y)), O)
    draw_line(pixels, n, (int(sp_x), int(y+sp_h)), (int(sp_x+sp_w), int(y+sp_h)), O)
    draw_line(pixels, n, (int(sp_x), int(y)), (int(sp_x), int(y+sp_h)), O)
    draw_line(pixels, n, (int(sp_x+sp_w), int(y)), (int(sp_x+sp_w), int(y+sp_h)), O)

    # Spire triangle
    apex = (cx, y - n*0.08)
    left = (sp_x, y)
    right = (sp_x + sp_w, y)
    fill_triangle(pixels, n, apex, left, right, L, M)
    draw_line(pixels, n, (int(apex[0]), int(apex[1])), (int(left[0]), int(left[1])), O)
    draw_line(pixels, n, (int(apex[0]), int(apex[1])), (int(right[0]), int(right[1])), O)
    draw_line(pixels, n, (int(left[0]), int(left[1])), (int(right[0]), int(right[1])), O)

    # Antenna
    if n >= 32:
        draw_line(pixels, n, (int(cx), int(apex[1]-n*0.06)), (int(cx), int(apex[1])), O)

    return pixels


def main():
    out_dir = os.path.join(os.path.dirname(__file__), 'icons')
    os.makedirs(out_dir, exist_ok=True)
    sizes = [16, 32, 48, 128]
    for s in sizes:
        px = draw_tower(s)
        path = os.path.join(out_dir, f'icon{s}.png')
        write_png_rgba(path, s, s, px)
    print('Generated tower icons at', out_dir)


if __name__ == '__main__':
    main()

