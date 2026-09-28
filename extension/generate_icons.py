from pathlib import Path
import zlib
import struct
import math
import os

def create_png(width, height, get_pixel_func):
    """
    Pure Python PNG generator using standard library zlib & struct.
    No external dependencies!
    """
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0)  # Filter byte: None
        for x in range(width):
            r, g, b, a = get_pixel_func(x, y, width, height)
            raw_data.extend([int(r), int(g), int(b), int(a)])

    def chunk(tag, data):
        length = len(data)
        crc = zlib.crc32(tag + data) & 0xffffffff
        return struct.pack("!I", length) + tag + data + struct.pack("!I", crc)

    png = bytearray(b"\x89PNG\r\n\x1a\n")
    # IHDR
    png.extend(chunk(b"IHDR", struct.pack("!IIBBBBB", width, height, 8, 6, 0, 0, 0)))
    # IDAT
    compressed = zlib.compress(bytes(raw_data), 9)
    png.extend(chunk(b"IDAT", compressed))
    # IEND
    png.extend(chunk(b"IEND", b""))
    return bytes(png)

def icon_pixel(x, y, w, h):
    # 中心座標正規化 (-1.0 ~ 1.0)
    nx = (x - w / 2) / (w / 2)
    ny = (y - h / 2) / (h / 2)
    dist = math.sqrt(nx * nx + ny * ny)

    # 1. 角丸四角形マスク
    corner_r = 0.4
    # 外周チェック
    ax = abs(nx)
    ay = abs(ny)
    if ax > (1.0 - corner_r) and ay > (1.0 - corner_r):
        cdist = math.sqrt((ax - (1.0 - corner_r))**2 + (ay - (1.0 - corner_r))**2)
        if cdist > corner_r:
            return (0, 0, 0, 0) # 透明

    # 背景グラデーション (ダークスレート #0f131f -> #1a2236)
    t = (ny + 1) / 2 # 0 ~ 1
    bg_r = int(15 + t * 12)
    bg_g = int(19 + t * 15)
    bg_b = int(31 + t * 25)

    # 2. 黄金の光輪（Aperture 円環）
    ring_radius = 0.72
    ring_width = 0.08
    ring_dist = abs(dist - ring_radius)
    if ring_dist < ring_width:
        alpha = 1.0 - (ring_dist / ring_width)
        # 黄金色 #f59e0b
        gr = 245
        gg = 158
        gb = 11
        bg_r = int(bg_r * (1 - alpha) + gr * alpha)
        bg_g = int(bg_g * (1 - alpha) + gg * alpha)
        bg_b = int(bg_b * (1 - alpha) + gb * alpha)

    # 3. 蓮の花びら (Lotus / 成仏のエメラルド #10b981)
    # 左右花びらの判定
    # ny: 上がマイナス、下がプラス
    petal_y = ny + 0.1
    # 左花びら
    lp_x = nx + 0.28
    lp_dist = math.sqrt(lp_x * lp_x * 2.5 + petal_y * petal_y * 1.8)
    if lp_dist < 0.42 and petal_y > -0.3:
        p_alpha = min(1.0, (0.42 - lp_dist) * 8.0)
        bg_r = int(bg_r * (1 - p_alpha) + 16 * p_alpha)
        bg_g = int(bg_g * (1 - p_alpha) + 185 * p_alpha)
        bg_b = int(bg_b * (1 - p_alpha) + 129 * p_alpha)

    # 右花びら
    rp_x = nx - 0.28
    rp_dist = math.sqrt(rp_x * rp_x * 2.5 + petal_y * petal_y * 1.8)
    if rp_dist < 0.42 and petal_y > -0.3:
        p_alpha = min(1.0, (0.42 - rp_dist) * 8.0)
        bg_r = int(bg_r * (1 - p_alpha) + 16 * p_alpha)
        bg_g = int(bg_g * (1 - p_alpha) + 185 * p_alpha)
        bg_b = int(bg_b * (1 - p_alpha) + 129 * p_alpha)

    # 4. 中央の創発の光芒 (核融合の光 #fbbf24)
    cp_dist = math.sqrt(nx * nx * 3.8 + (ny + 0.05) * (ny + 0.05) * 1.2)
    if cp_dist < 0.48:
        c_alpha = min(1.0, (0.48 - cp_dist) * 6.0)
        bg_r = int(bg_r * (1 - c_alpha) + 251 * c_alpha)
        bg_g = int(bg_g * (1 - c_alpha) + 191 * c_alpha)
        bg_b = int(bg_b * (1 - c_alpha) + 36 * c_alpha)

    # 5. 核の中心スパーク (ホワイト #ffffff)
    spark_dist = math.sqrt(nx * nx + (ny + 0.05) * (ny + 0.05))
    if spark_dist < 0.12:
        s_alpha = min(1.0, (0.12 - spark_dist) * 12.0)
        bg_r = int(bg_r * (1 - s_alpha) + 255 * s_alpha)
        bg_g = int(bg_g * (1 - s_alpha) + 255 * s_alpha)
        bg_b = int(bg_b * (1 - s_alpha) + 255 * s_alpha)

    return (bg_r, bg_g, bg_b, 255)

out_dir = str(Path(__file__).resolve().parent / "icons")
os.makedirs(out_dir, exist_ok=True)

for size in [16, 48, 128]:
    png_bytes = create_png(size, size, icon_pixel)
    file_path = os.path.join(out_dir, f"icon-{size}.png")
    with open(file_path, "wb") as f:
        f.write(png_bytes)
    print(f"Generated {file_path} ({len(png_bytes)} bytes)")
