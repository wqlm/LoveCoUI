#!/usr/bin/env python3
"""把 potrace 的曲线展平、用 even-odd 栅格化，跟原图墨迹算 IoU（选参数用）。

用途：调 potrace 参数（blur / 阈值 / 线宽）时，先在本地快速筛掉错的档，
不必每次都起 Chrome 截图。注意它比的是 **potrace 自己的栅格化**，
不是浏览器渲染 —— 最终验收还是要用 `shot2x.mjs` 截真图（浏览器会改抗锯齿）。

    python trace-iou.py <原图.png> [blur ...]
    python trace-iou.py globe.png 0.5 1.0        # 只试这两档模糊

不带参数就扫一遍默认的 blur 档，打印每档的子路径数 / 角点数 / IoU / 漏 / 多。

**两个坑**（都踩过）：
1. 展平贝塞尔时，每段的起点是**上一段的终点**，不是 `curve.start_point`。
   一直用 start_point 会画出完全错的形状，IoU 掉到 0.40，很容易误判成"描歪了"。
2. 二值 IoU 对细线极度敏感：0.4px 的线宽差就是 20% 误差，
   而抗锯齿又会把渲染图撑胖 —— 于是 IoU 随线宽**单调下降**，永远挑到最细的错档。
   定线宽请改用"墨迹质量"（见下 `mass()`）。
"""
import sys

import numpy as np
import potrace
from PIL import Image, ImageChops, ImageDraw, ImageFilter

UP = 4                                    # 与 trace-hand.py 一致


def flatten(mask, up=UP, samples=24):
    """potrace 曲线 → 折线（子路径列表），顺便数角点数。"""
    path = potrace.Bitmap(~mask).trace(
        turdsize=up * up * 4, turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY,
        alphamax=1.0, opticurve=True, opttolerance=1.6)
    subs, corners = [], 0
    for c in path.curves:                 # 平铺列表：外轮廓与孔洞是兄弟
        pts = [(c.start_point.x, c.start_point.y)]
        cur = c.start_point               # ← 坑 1：起点要跟着走
        for seg in c:
            if seg.is_corner:
                pts.append((seg.c.x, seg.c.y))
                pts.append((seg.end_point.x, seg.end_point.y))
                corners += 2
            else:
                for t in np.linspace(0, 1, samples)[1:]:
                    mt = 1 - t
                    pts.append((
                        (mt**3)*cur.x + 3*(mt**2)*t*seg.c1.x + 3*mt*(t**2)*seg.c2.x + (t**3)*seg.end_point.x,
                        (mt**3)*cur.y + 3*(mt**2)*t*seg.c1.y + 3*mt*(t**2)*seg.c2.y + (t**3)*seg.end_point.y))
            cur = seg.end_point
        subs.append(pts)
    return subs, corners


def raster(subs, shape, scale=1.0, off=(0.0, 0.0)):
    """even-odd 栅格化：每条子路径单独填充再 XOR（PIL 没有 XOR 填充，得自己叠）。"""
    acc = None
    for pts in subs:
        im = Image.new('1', (shape[1], shape[0]), 0)
        ImageDraw.Draw(im).polygon(
            [((x - off[0]) * scale, (y - off[1]) * scale) for x, y in pts], fill=1)
        acc = im if acc is None else ImageChops.logical_xor(acc, im)
    return np.asarray(acc, bool) if acc is not None else np.zeros(shape, bool)


def load_ink(src, blur):
    im = Image.open(src).convert('RGBA')
    w, h = im.size
    a = im.getchannel('A')
    if blur:
        a = a.filter(ImageFilter.GaussianBlur(blur))   # 先模糊再放大（见 trace-hand.py）
    return np.asarray(a.resize((w * UP, h * UP), Image.LANCZOS)) > 128, w, h


def mass(gray):
    """墨迹"质量"：白底黑图里的总墨量。定线宽用这个，不要用二值 IoU。"""
    return float(((255.0 - gray) / 255.0).sum())


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = sys.argv[1]
    blurs = [float(x) for x in sys.argv[2:]] or [0.0, 0.5, 1.0]
    ref = np.asarray(Image.open(src).convert('RGBA').getchannel('A')) > 128
    print(f'原图墨迹 {ref.sum()} px   墨迹质量 {mass(np.asarray(Image.open(src).convert("RGBA").getchannel("A"))):.1f}')
    for blur in blurs:
        ink, w, h = load_ink(src, blur)
        subs, corners = flatten(ink)
        r = raster(subs, ink.shape)                 # 同一栅格比，排除量化误差
        i, u = (r & ink).sum(), (r | ink).sum()
        print(f'blur={blur:<4} 子路径={len(subs):3d} 角点={corners:4d} '
              f'IoU={i/u:.4f} 漏={(ink & ~r).sum():6d} 多={(r & ~ink).sum():6d}')
