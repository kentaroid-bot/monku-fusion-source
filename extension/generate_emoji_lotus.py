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

def emoji_lotus_pixel(x, y, w, h):
    # -1.0 ~ 1.0 に正規化
    nx = (x - (w - 1) / 2.0) / ((w - 1) / 2.0)
    ny = (y - (h - 1) / 2.0) / ((h - 1) / 2.0)

    # 1. 一番下の蓮の葉・台座 (グリーン #10b981 ~ #059669)
    # y: 0.5 ~ 0.95
    leaf_y = ny - 0.65
    leaf_dist = math.sqrt(nx * nx * 1.5 + leaf_y * leaf_y * 8.0)
    is_leaf = leaf_dist < 0.85 and ny > 0.45

    # 2. 外側の大きな花びら（鮮やかなピンク・ローズ #f43f5e ~ #fb7185）
    outer_y = ny - 0.05
    # 左外花びら
    lop_dist = math.sqrt((nx + 0.45)**2 * 1.8 + (outer_y - 0.1)**2 * 2.2)
    # 右外花びら
    rop_dist = math.sqrt((nx - 0.45)**2 * 1.8 + (outer_y - 0.1)**2 * 2.2)
    is_outer_petal = (lop_dist < 0.58 and ny < 0.6) or (rop_dist < 0.58 and ny < 0.6)

    # 3. 内側の花びら（ピュアピンク〜ホワイトグラデーション #fda4af ~ #ffffff）
    inner_y = ny + 0.05
    # 左内花びら
    lip_dist = math.sqrt((nx + 0.22)**2 * 2.2 + inner_y**2 * 1.8)
    # 右内花びら
    rip_dist = math.sqrt((nx - 0.22)**2 * 2.2 + inner_y**2 * 1.8)
    is_inner_petal = (lip_dist < 0.55 and ny < 0.6) or (rip_dist < 0.55 and ny < 0.6)

    # 4. 中央のメイン花びら（トップの尖り #f43f5e ~ ホワイト）
    center_dist = math.sqrt(nx * nx * 3.5 + (ny + 0.15)**2 * 1.3)
    is_center_petal = center_dist < 0.68 and ny < 0.65

    # 5. 花の中心（黄金の雄しべ / スパーク #fbbf24）
    spark_dist = math.sqrt(nx * nx * 3.0 + (ny - 0.22)**2 * 6.0)
    is_spark = spark_dist < 0.35

    # 描画優先度判定
    if is_spark:
        return (251, 191, 36, 255) # ゴールド
    elif is_center_petal:
        # 上部は白っぽく、下部は鮮やかピンク
        t = max(0.0, min(1.0, (ny + 0.7) / 1.3))
        r = int(255 * (1 - t) + 244 * t)
        g = int(255 * (1 - t) + 63 * t)
        b = int(255 * (1 - t) + 94 * t)
        return (r, g, b, 255)
    elif is_inner_petal:
        # 淡いピンク〜白
        return (253, 164, 175, 255)
    elif is_outer_petal:
        # 鮮やかローズピンク
        return (244, 63, 94, 255)
    elif is_leaf:
        # エメラルドグリーン
        return (16, 185, 129, 255)

    return (0, 0, 0, 0) # 完全透過

out_dir = str(Path(__file__).resolve().parent / "icons")
os.makedirs(out_dir, exist_ok=True)

for size in [16, 48, 128]:
    png_bytes = create_png(size, size, emoji_lotus_pixel)
    file_path = os.path.join(out_dir, f"icon-{size}.png")
    with open(file_path, "wb") as f:
        f.write(png_bytes)
    print(f"Generated emoji-style {file_path}")
