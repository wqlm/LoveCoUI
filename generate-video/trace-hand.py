#!/usr/bin/env python3
"""把一张手势/图标位图矢量化成 SVG path（potrace）。

用途：用户直接甩一张图说"手势图标换成这个"时，不用去找它属于哪个图标库、
也不用硬画 —— 直接描出来，跟原图几乎像素级一致。

    pip install potracer pillow numpy
    python trace-hand.py <参考图.png> [path.txt] [svg.svg] [--nocrop]

流程：alpha 通道 → 高斯模糊 1.0（原分辨率）→ 4x LANCZOS 放大 → 50% 阈值二值化
     → potrace 曲线拟合 → 取 path。
模糊必须在放大之前：反过来做会把放大产生的阶梯边固化成硬棱，potrace 就会吐出
几百个 L 拐点（8 个 vs 几百个的差别）。

默认裁剪到墨迹包围盒（坐标起点挪到 0,0），这样页面里 viewBox 直接 `0 0 <裁后宽> <裁后高>`，
显示盒子不留大片空白；--nocrop 保留原图整幅画布。
输出还会打印墨迹包围盒 + 指尖坐标 + 裁剪偏移 ——
这几组数就是 index.html 里手 SVG 尺寸 / TIMELINE.tipPath / handScale 的依据。

**关键坑**：potracer 的 `path.curves` 是平铺列表（外轮廓与孔洞是兄弟，children 恒空）。
必须把整列表拼进同一个 d 并用 `fill-rule="evenodd"`，才是原图墨迹；
把每条 curve 单独当时一层画，会得到「整只手剪影 + 手掌内腔」两块实心图形。

用法示例（描边图标 → 卡通实心手，两层）：
  python trace-hand.py 图标.png /tmp/hand.d.txt /tmp/hand.svg     # 墨迹（深色描边层）
  # 手掌剪影层：对 mask 做 fill_holes（把指缝/内腔一起填上）再 trace，得到整只手剪影，
  # 铺在墨迹层下面染肉色，就是「肉色实体 + 深描边」的卡通手（见 index-kbswitch.html）。
  # 只要描边、内部透明（用户说"不需要肉色填充，透明就行"）：把 fill 那一层删掉即可，
  # 剩下的墨迹本身就是空心线稿。

**别描小尺寸的几何图标**（地球 / 齿轮 / wifi 这类 ≤64px 的线条图标）：
  在 4x 栅格上算 IoU 有 0.93，但那是"细线对亚像素误差最敏感"的假象 ——
  导到成片尺寸看，曲线会被描成带疙瘩的粗团（线只有 2px，0.4px 的误差就是 20%）。
  这类图标应当**量出几何再重画**：逐行扫墨迹段求出圆心/半径/线宽/弧的半径，
  用 `<circle>/<ellipse>/<path>` 原语写，任何倍率都锋利。见 index-kbswitch.html 的 #globe。

**怎么确认描对了**：别凭肉眼比例判断。把 d 塞进一个 339x458 的 svg，用 shot2x.mjs
截 1x 图，跟原图带 alpha 的裁剪图二值化后算 IoU —— 0.99 以上才算合格。
（注意 shot2x.mjs 的 clip 超出 layout viewport 的部分会截成空白，会误判成「描漏了」，
  单面板截图别超过 640 宽。）

**线宽（几何重建时）别用二值 IoU 挑**：抗锯齿会把渲染图"撑胖"，
阈值一卡 IoU 就随线宽单调下降，永远挑最细的那档（错的）。
改用**墨迹质量**：`sum(alpha)/255` vs `sum((255-gray)/255)`，让两边总量相等。
地球图标就这样定出 stroke-width=2.0（质量 = 原图 98.9%，同时漏描仅 6px）。
"""
import sys
import numpy as np
import potrace
from PIL import Image, ImageFilter

args = [a for a in sys.argv[1:] if not a.startswith('--')]
CROP = '--nocrop' not in sys.argv

SRC = args[0] if len(args) > 0 else \
    '/Users/wqlm/.workbuddy/clipboard-images/clipboard-2026-09-28T04-13-17-139Z-39d57a78.png'
OUT_TXT = args[1] if len(args) > 1 else '/tmp/loveco-video/hand-trace.d.txt'
OUT_SVG = args[2] if len(args) > 2 else '/tmp/loveco-video/hand-trace.svg'

UP = 4                       # 先放大再二值化，曲线拟合更平滑
OPTTOL = 1.6                 # 越大点越少；1.5~2 肉眼无差，path 能短一半
BLUR = 1.0                   # 原分辨率上先柔化，消掉像素阶梯

im = Image.open(SRC).convert('RGBA')
W, H = im.size
alpha = im.getchannel('A').filter(ImageFilter.GaussianBlur(BLUR))
up = alpha.resize((W * UP, H * UP), Image.LANCZOS)
ink = np.asarray(up) > 128                     # 50% 阈值 = 抗锯齿边缘中点

# 裁剪到墨迹包围盒：坐标整体平移 (-ox, -oy)
ys0, xs0 = np.where(ink)
ox, oy = (xs0.min() / UP, ys0.min() / UP) if CROP else (0.0, 0.0)

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
    return f'{f(p.x - ox * UP)} {f(p.y - oy * UP)}'


out = []


# 注意：potracer 的 path.curves 是 **平铺** 的列表 —— 外轮廓和孔洞是兄弟节点，
# children 恒为空（别指望递归出孔洞）。所以必须把整列表拼成同一个 d，配
# fill-rule="evenodd"：外层填满、孔洞再挖掉，才是原图的墨迹。
# 反例（踩过）：把每条 curve 当成一层单独画 —— 得到的是「整只手剪影 + 手掌内腔」
# 两个实心块，完全不是墨迹；而两份 d 用 evenodd 拼一起又会把墨迹互相抵消成白。
def emit(curve):
    out.append(f'M{P(curve.start_point)}')
    for seg in curve:
        if seg.is_corner:
            out.append(f'L{P(seg.c)}L{P(seg.end_point)}')
        else:
            out.append(f'C{P(seg.c1)} {P(seg.c2)} {P(seg.end_point)}')
    out.append('Z')
    for ch in (getattr(curve, 'children', None) or []):   # potracer 恒空，留着兼容
        emit(ch)


n_top = 0
for curve in path.curves:
    emit(curve)
    n_top += 1
d = ''.join(out)
print(f'轮廓数   : {n_top}（含孔洞，全部平铺在同一个 d 里，用 evenodd）')

ys, xs = np.where(ink)
x0, x1, y0, y1 = xs.min() / UP, xs.max() / UP, ys.min() / UP, ys.max() / UP

# 指尖 = 最上面那一行墨迹的 x 中点（食指圆弧顶点），也就是光标热点
row = xs[ys <= ys.min() + 2]
tipx = (row.min() + row.max()) / 2 / UP

CW, CH = (x1 - x0, y1 - y0) if CROP else (W, H)

open(OUT_TXT, 'w').write(d)
open(OUT_SVG, 'w').write(
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {CW:.0f} {CH:.0f}">'
    f'<path fill="#141414" fill-rule="evenodd" d="{d}"/></svg>')

print(f'顶层轮廓 : {n_top}    path 长度: {len(d)}')
print(f'墨迹包围盒: x {x0:.1f}..{x1:.1f}   y {y0:.1f}..{y1:.1f}   ({x1-x0:.1f} x {y1-y0:.1f})')
print(f'裁剪偏移  : {ox:.1f} {oy:.1f}')
print(f'指尖(热点): ({tipx - ox:.1f}, 0)   裁后画布: {CW:.0f} x {CH:.0f}')
print(f'-> {OUT_TXT}\n-> {OUT_SVG}')
print()
print('接进 index.html：')
print(f'  viewBox 用 "0 0 {CW:.0f} {CH:.0f}"；选好显示高度 box 后 缩放 = box / {CH:.0f}')
print(f'  <svg width="{CW*0.2:.1f}" height="{(CH)*0.2:.1f}">（示例缩放 0.2）')
print(f'  TIMELINE.tipPath = [{(tipx-ox):.1f}, 0]、handScale = box / {CH:.0f}')
print('  再用 shot2x.mjs 截 ?t= 附近一帧，核对指尖是否正压在目标元素中心')
