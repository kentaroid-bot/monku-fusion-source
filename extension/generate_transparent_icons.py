from pathlib import Path
import zlib
import struct
import math
import os

def create_png(width, height, get_pixel_func):
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0)  # Filter byte
        for x in range(width):
            r, g, b, a = get_pixel_func(x, y, width, height)
            raw_data.extend([int(r), int(g), int(b), int(a)])

    def chunk(tag, data):
        length = len(data)
        crc = zlib.crc32(tag + data) & 0xffffffff
        return struct.pack("!I", length) + tag + data + struct.pack("!I", crc)

    png = bytearray(b"\x89PNG\r\n\x1a\n")
    png.extend(chunk(b"IHDR", struct.pack("!IIBBBBB", width, height, 8, 6, 0, 0, 0)))
    compressed = zlib.compress(bytes(raw_data), 9)
    png.extend(chunk(b"IDAT", compressed))
    png.extend(chunk(b"IEND", b""))
    return bytes(png)

def transparent_icon_pixel(x, y, w, h):
    # 正規化座標 (-1.0 ~ 1.0)
    nx = (x - (w - 1) / 2.0) / ((w - 1) / 2.0)
    ny = (y - (h - 1) / 2.0) / ((h - 1) / 2.0)
    dist = math.sqrt(nx * nx + ny * ny)

    # 初期値：完全透過 (0, 0, 0, 0)
    r, g, b, a = 0, 0, 0, 0

    # 1. 黄金の光輪（Aperture 太い外周リング）
    ring_radius = 0.82
    ring_half_width = 0.14
    ring_dist = abs(dist - ring_radius)
    if ring_dist < ring_half_width:
        # クッキリしたエッジ
        edge = max(0.0, min(1.0, (ring_half_width - ring_dist) * 10.0))
        r, g, b, a = 245, 158, 11, int(255 * edge)

    # 2. 左右の外側花びら (成仏・エメラルドグリーン #10b981)
    petal_y = ny + 0.12
    # 左花びら
    lp_x = nx + 0.32
    lp_dist = math.sqrt(lp_x * lp_x * 2.2 + petal_y * petal_y * 1.6)
    if lp_dist < 0.46 and petal_y > -0.35:
        p_alpha = max(0.0, min(1.0, (0.46 - lp_dist) * 8.0))
        if p_alpha > 0:
            # 既存色とブレンド
            cur_a = a / 255.0
            new_a = p_alpha
            out_a = cur_a + new_a * (1 - cur_a)
            if out_a > 0:
                r = int((r * cur_a + 16 * new_a * (1 - cur_a)) / out_a)
                g = int((g * cur_a + 185 * new_a * (1 - cur_a)) / out_a)
                b = int((b * cur_a + 129 * new_a * (1 - cur_a)) / out_a)
                a = int(out_a * 255)

    # 右花びら
    rp_x = nx - 0.32
    rp_dist = math.sqrt(rp_x * rp_x * 2.2 + petal_y * petal_y * 1.6)
    if rp_dist < 0.46 and petal_y > -0.35:
        p_alpha = max(0.0, min(1.0, (0.46 - rp_dist) * 8.0))
        if p_alpha > 0:
            cur_a = a / 255.0
            new_a = p_alpha
            out_a = cur_a + new_a * (1 - cur_a)
            if out_a > 0:
                r = int((r * cur_a + 16 * new_a * (1 - cur_a)) / out_a)
                g = int((g * cur_a + 185 * new_a * (1 - cur_a)) / out_a)
                b = int((b * cur_a + 129 * new_a * (1 - cur_a)) / out_a)
                a = int(out_a * 255)

    # 3. 中央の主花びら (力強い黄金光芒 #fbbf24)
    cp_dist = math.sqrt(nx * nx * 3.2 + (ny + 0.08) * (ny + 0.08) * 1.1)
    if cp_dist < 0.52:
        c_alpha = max(0.0, min(1.0, (0.52 - cp_dist) * 8.0))
        if c_alpha > 0:
            cur_a = a / 255.0
            new_a = c_alpha
            out_a = cur_a + new_a * (1 - cur_a)
            if out_a > 0:
                r = int((r * cur_a + 251 * new_a * (1 - cur_a)) / out_a)
                g = int((g * cur_a + 191 * new_a * (1 - cur_a)) / out_a)
                b = int((b * cur_a + 36 * new_a * (1 - cur_a)) / out_a)
                a = int(out_a * 255)

    # 4. 中心の核 (ホワイトスパーク ⚡ #ffffff)
    spark_dist = math.sqrt(nx * nx * 2.0 + (ny + 0.05) * (ny + 0.05) * 1.5)
    if spark_dist < 0.18:
        s_alpha = max(0.0, min(1.0, (0.18 - spark_dist) * 12.0))
        if s_alpha > 0:
            cur_a = a / 255.0
            new_a = s_alpha
            out_a = cur_a + new_a * (1 - cur_a)
            if out_a > 0:
                r = int((r * cur_a + 255 * new_a * (1 - cur_a)) / out_a)
                g = int((g * cur_a + 255 * new_a * (1 - cur_a)) / out_a)
                b = int((b * cur_a + 255 * new_a * (1 - cur_a)) / out_a)
                a = int(out_a * 255)

    return (r, g, b, a)

out_dir = str(Path(__file__).resolve().parent / "icons")
os.makedirs(out_dir, exist_ok=True)

for size in [16, 48, 128]:
    png_bytes = create_png(size, size, transparent_icon_pixel)
    file_path = os.path.join(out_dir, f"icon-{size}.png")
    with open(file_path, "wb") as f:
        f.write(png_bytes)
    print(f"Updated {file_path} ({len(png_bytes)} bytes)")
