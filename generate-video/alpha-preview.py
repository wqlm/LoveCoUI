#!/usr/bin/env python3
"""把带 alpha 的 mov / png 合到棋盘底上，导出「能一眼看出是真透明」的预览图。

透明素材（qtrle mov）本身没有底色，直接看只能看到黑或白 —— 必须垫个棋盘格
才能确认透明区域真的透明。本脚本就干这一件事。

用法:
    python alpha-preview.py out/loveco-kbswitch-alpha-2x.mov /tmp/preview.png 1.0 3.4
    python alpha-preview.py frame.png out.png            # 直接给 PNG 也行
    CELL=16 python alpha-preview.py in.mov out.png 1.0   # 改棋盘格子大小

多个时刻会给成一张纵向拼接图（每个时刻一条，左上角标时刻）。
中间产物（抽出来的含 alpha 帧）写在 TMPROOT 下，默认 /tmp/loveco-video/preview。
"""
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw

TMPROOT = os.environ.get("TMPROOT", "/tmp/loveco-video")
OUTDIR = os.path.join(TMPROOT, "preview")


def ffmpeg_exe():
    if os.environ.get("FFMPEG"):
        return os.environ["FFMPEG"]
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


def grab(src, t, dst):
    """从视频里取 t 秒那一帧（保留 alpha）。"""
    ff = ffmpeg_exe()
    subprocess.run(
        [ff, "-y", "-v", "error", "-ss", f"{t}", "-i", src, "-frames:v", "1", dst],
        check=True,
    )


def checker(w, h, cell):
    """浅灰/白棋盘：和「白底」能明显区分，又不会抢画面颜色。"""
    yy, xx = np.mgrid[0:h, 0:w]
    m = ((xx // cell) + (yy // cell)) % 2
    out = np.empty((h, w, 3), np.uint8)
    out[m == 0] = (255, 255, 255)
    out[m == 1] = (204, 204, 204)
    return Image.fromarray(out, "RGB")


def compose(src, t, cell):
    with tempfile.TemporaryDirectory(dir=OUTDIR) as td:
        f = os.path.join(td, "f.png")
        grab(src, t, f)
        rgba = Image.open(f).convert("RGBA")
    bg = checker(*rgba.size, cell).convert("RGBA")
    bg.alpha_composite(rgba)
    out = bg.convert("RGB")
    if t is not None:
        d = ImageDraw.Draw(out)
        tag = f"t={t}s"
        d.rectangle([0, 0, 12 + 9 * len(tag), 30], fill=(20, 20, 20))
        d.text((7, 8), tag, fill=(255, 255, 255))
    return out


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    src, dst = sys.argv[1], sys.argv[2]
    args = sys.argv[3:]
    cell = int(os.environ.get("CELL", "20"))
    os.makedirs(OUTDIR, exist_ok=True)

    if not args:
        imgs = [compose(src, None, cell)]
    else:
        imgs = [compose(src, float(t), cell) for t in args]

    w = max(i.width for i in imgs)
    h = sum(i.height for i in imgs)
    canvas = Image.new("RGB", (w, h), (255, 255, 255))
    y = 0
    for i in imgs:
        canvas.paste(i, (0, y))
        y += i.height
    canvas.save(dst)
    print(f"[preview] {dst}  {canvas.width}x{canvas.height}  ({len(imgs)} 帧，棋盘格 {cell}px)")


if __name__ == "__main__":
    main()
