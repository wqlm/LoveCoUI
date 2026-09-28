#!/usr/bin/env python3
"""把一张手势/图标位图矢量化成 SVG path（potrace）。

用途：用户直接甩一张图说"手势图标换成这个"时，不用去找它属于哪个图标库、
也不用硬画 —— 直接描出来，跟原图几乎像素级一致。

    pip install potracer pillow numpy
    python trace-hand.py <参考图.png> [path.txt] [svg.svg]

流程：alpha 通道 → 4x LANCZOS 放大 → 50% 阈值二值化 → potrace 曲线拟合 → 取 path。
输出坐标按原图像素（viewBox 直接用 `0 0 <宽> <高>`），并打印墨迹包围盒 + 指尖坐标 ——
这两组数就是 index.html 里 #cursor 尺寸 / transform-origin / TIMELINE.hotspot 的依据。
"""
import sys
import numpy as np
import potrace
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else \
    '/Users/wqlm/.workbuddy/clipboard-images/clipboard-2026-09-28T04-13-17-139Z-39d57a78.png'
OUT_TXT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/loveco-video/hand-trace.d.txt'
OUT_SVG = sys.argv[3] if len(sys.argv) > 3 else '/tmp/loveco-video/hand-trace.svg'

UP = 4                       # 先放大再二值化，曲线拟合更平滑
OPTTOL = 1.6                 # 越大点越少；1.5~2 肉眼无差，path 能短一半

im = Image.open(SRC).convert('RGBA')
W, H = im.size
alpha = np.asarray(im)[..., 3]
up = Image.fromarray(alpha).resize((W * UP, H * UP), Image.LANCZOS)
ink = np.asarray(up) > 128                     # 50% 阈值 = 抗锯齿边缘中点

# 坑：potracer 的 Bitmap 只认 bool 数组。传 uint8 会走 `data > 127` 分支，
# 0/1 的数组全变 False，再被内部 invert() 翻成全 True —— 最后描出一整幅方框。
# 而且构造时会自己 invert()，「黑」的那一侧才被描出来，所以这里要取反。
path = potrace.Bitmap(~ink).trace(
    turdsize=UP * UP * 4,
    turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY,
    alphamax=1.0,
    opticurve=True,
    opttolerance=OPTTOL,
)


def f(v):
    s = f'{v / UP:.1f}'.rstrip('0').rstrip('.')
    return s or '0'


def P(p):
    return f'{f(p.x)} {f(p.y)}'


out = []


def emit(curve):
    out.append(f'M{P(curve.start_point)}')
    for seg in curve:
        if seg.is_corner:
            out.append(f'L{P(seg.c)}L{P(seg.end_point)}')
        else:
            out.append(f'C{P(seg.c1)} {P(seg.c2)} {P(seg.end_point)}')
    out.append('Z')
    for ch in (getattr(curve, 'children', None) or []):
        emit(ch)


n_top = 0
for curve in path.curves:
    emit(curve)
    n_top += 1
d = ''.join(out)

ys, xs = np.where(ink)
x0, x1, y0, y1 = xs.min() / UP, xs.max() / UP, ys.min() / UP, ys.max() / UP

# 指尖 = 最上面那一行墨迹的 x 中点（食指圆弧顶点），也就是光标热点
row = xs[ys <= ys.min() + 2]
tipx = (row.min() + row.max()) / 2 / UP

open(OUT_TXT, 'w').write(d)
open(OUT_SVG, 'w').write(
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}">'
    f'<path fill="#242424" fill-rule="evenodd" d="{d}"/></svg>')

print(f'顶层轮廓 : {n_top}    path 长度: {len(d)}')
print(f'墨迹包围盒: x {x0:.1f}..{x1:.1f}   y {y0:.1f}..{y1:.1f}   ({x1-x0:.1f} x {y1-y0:.1f})')
print(f'指尖(热点): ({tipx:.1f}, {y0:.1f})   viewBox: 0 0 {W} {H}')
print(f'-> {OUT_TXT}\n-> {OUT_SVG}')
print()
print('接进 index.html：')
print(f'  viewBox 用 "0 0 {W} {H}"；选好显示边长 box 后 缩放 = box / {W}')
print(f'  #cursor 的 width/height = box；transform-origin 和 TIMELINE.hotspot 都填 (指尖 × 缩放)')
print('  再用 shot2x.mjs 截 ?t= 附近一帧，核对指尖是否正压在目标元素中心')
