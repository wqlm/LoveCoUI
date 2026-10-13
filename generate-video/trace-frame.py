#!/usr/bin/env python3
"""从参考视频的某一帧里抠出一个物件（手势/图标/按钮），矢量化成 SVG path。

和 trace-hand.py 的区别：trace-hand.py 吃的是**已经抠好、带 alpha 的 PNG**；
这个吃的是**整帧截图（RGB，无 alpha）**，按颜色分割出目标，所以适合
"用户丢来一段录屏，让我照着 1:1 复刻"的场景。

输出两个 path（双击层，最忠实原图，不用 stroke 猜描边厚度）：
    <out>.line.txt   剪影（目标 + 深色描边）—— 用深色填充
    <out>.body.txt   目标本体（不含描边）—— 用主色填充
叠它们得到的图和原帧像素级一致：描边宽度、圆角全都自带。

    python trace-frame.py --frame all/230.png --box 294 244 440 352 \
        --hue skin --out /tmp/x/hand

--hue 预置了几种分割：
    skin    暖色皮肤（R-B>28 且 R-G>15）
    dark    深色描边（max(RGB)<115）
    light   浅色（min(RGB)>200）
    blue    饱和蓝（B-R>50）

坐标系：输出的 path 是**裁切框内的相对坐标**，viewBox 直接写 `0 0 <w> <h>`
（w/h 就是 box 的宽高）；元素在页面里用 left/top 摆到目标位置。
"""
import argparse
import numpy as np
import potrace
from PIL import Image, ImageFilter

UP = 6            # 先放大再二值化，曲线拟合更平滑
BLUR = 1.0        # 放大前先轻微模糊，消掉二值 mask 的台阶
DILATE = 5        # MaxFilter 窗口：补偿抗锯齿导致的分割边界内缩


def segment(a, kind):
    R, G, B = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    if kind == "skin":
        return (R - B > 28) & (R - G > 15) & (R > 195)
    if kind == "dark":
        return np.maximum(np.maximum(R, G), B) < 115
    if kind == "light":
        return np.minimum(np.minimum(R, G), B) > 200
    if kind == "blue":
        return (B - R > 50) & (B > 180)
    raise SystemExit(f"未知 --hue {kind}")


def build(mask, box, blur, dilate):
    x0, y0, x1, y1 = box
    m = Image.fromarray((mask[y0:y1, x0:x1].astype(float) * 255).astype("uint8"))
    if dilate:
        m = m.filter(ImageFilter.MaxFilter(dilate))
    if blur:
        m = m.filter(ImageFilter.GaussianBlur(blur))
    w, h = m.size
    return np.asarray(m.resize((w * UP, h * UP), Image.LANCZOS)) > 127


def trace(up, tol=1.8):
    """potracer 的 Bitmap 只认 bool 数组，而且构造时会自己 invert()，
    所以得把"要描的一侧"取反再传进去（传 uint8 会描出一整幅方框）。"""
    p = potrace.Bitmap(~up).trace(
        turdsize=UP * UP * 6,
        turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY,
        alphamax=1.0, opticurve=True, opttolerance=tol,
    )

    def f(v):
        s = f"{v / UP:.1f}".rstrip("0").rstrip(".")
        return s or "0"

    def P(q):
        return f"{f(q.x)} {f(q.y)}"

    out = []

    def emit(c):
        out.append(f"M{P(c.start_point)}")
        for seg in c:
            out.append(f"L{P(seg.c)}L{P(seg.end_point)}" if seg.is_corner
                       else f"C{P(seg.c1)} {P(seg.c2)} {P(seg.end_point)}")
        out.append("Z")
        for ch in (getattr(c, "children", None) or []):
            emit(ch)

    for c in p.curves:
        emit(c)
    return "".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--frame", required=True, help="参考帧 PNG")
    ap.add_argument("--box", required=True, nargs=4, type=int,
                    metavar=("X0", "Y0", "X1", "Y1"), help="裁切框（含描边）")
    ap.add_argument("--hue", default="skin", help="分割预设：skin/dark/light/blue")
    ap.add_argument("--out", required=True, help="输出前缀，会写 <out>.line.txt / <out>.body.txt")
    ap.add_argument("--dilate", type=int, default=DILATE)
    a = ap.parse_args()

    img = np.array(Image.open(a.frame).convert("RGB")).astype(int)
    body = segment(img, a.hue)
    ink = segment(img, "dark")
    box = tuple(a.box)

    line_d = trace(build(body | ink, box, BLUR, a.dilate))
    body_d = trace(build(body, box, 0.9, max(3, a.dilate - 2)))
    open(a.out + ".line.txt", "w").write(line_d)
    open(a.out + ".body.txt", "w").write(body_d)

    x0, y0, x1, y1 = box
    ys, xs = np.where((body | ink)[y0:y1, x0:x1])
    print(f"viewBox  0 0 {x1-x0} {y1-y0}")
    print(f"剪影 bbox(裁切框内) x {xs.min()}..{xs.max()}  y {ys.min()}..{ys.max()}"
          f"   ({xs.max()-xs.min()+1} x {ys.max()-ys.min()+1})")
    print(f"path      line {len(line_d)} 字符 / body {len(body_d)} 字符")
    print(f"-> {a.out}.line.txt\n-> {a.out}.body.txt")


if __name__ == "__main__":
    main()
