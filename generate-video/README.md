# HTML → 视频 复刻流水线（LoveCo 版）

把「HTML + CSS + JS」逐帧渲染成 MP4，用来改文案 / 换配音，**不用录屏、不用剪辑软件**。

这个目录是**自包含**的：4 支片子的页面（`index*.html`）、配音方案（`plans/*.sh`）、
配音（`audio/*.m4a`）、素材（`assets/`）、渲染脚本、成片（`out/`）都在里面，
拿走整个 `generate-video/` 就能独立跑（只依赖本机 node / Chrome / ffmpeg，见「依赖」）。

## 改哪里速查

**绝大多数改动只碰两类文件**：某支片子的 `index*.html`（画面 + 时间轴），
和它对应的 `plans/*.sh`（配音文案 + 落点）。改完 `TARGET=<片子> ./run.sh` 重出。

四支片子共用同一套渲染 + 配音 + 校验流水线，靠 `TARGET` 切：

| 片子（`TARGET=`） | 画面（HTML） | 时间轴 | 配音文案 + 落点 | 专属素材 | 成片 | 时长 |
|---|---|---|---|---|---|---|
| `tutorial`（默认） | `index.html` | `TIMELINE`；`#titles` 里两段 `<text>` | `plans/tutorial.sh` 的 `TEXTS` / `OFFSETS` | `assets/loveco-icon.png` | `out/loveco-tutorial-2x.mp4` | 6.5s |
| `ios-keyboard` | `index-ios.html` | 同上（两幕 + 推入转场） | `plans/ios-keyboard.sh` | — | `out/loveco-ios-keyboard-2x.mp4` | 7.0s |
| `android-keyboard` | `index-android.html` | 同上（单幕 + Material 开关） | `plans/android-keyboard.sh` | — | `out/loveco-android-keyboard-2x.mp4` | 4.0s |
| `kbswitch` | `index-kbswitch.html` | `TIMELINE` + `#titles` 里两组 `<text>` | `plans/kbswitch.sh` | `#globe` 的内联 SVG、`.hand` 的 `path` | `out/loveco-kbswitch-2x.mp4`（1124x644，见「画幅」节） | 4.15s |

几个高频旋钮：

- **画面文字** → `#titles` 里的 `<text>`（白描边黑字两层，改要两层一起改）；
  片 4 的字幕分两句，落点是 `TIMELINE.t1/t2`。
- **一句配音什么时候结束** → 页内 `TIMELINE` 的段落 `to` 必须和 `plans/*.sh` 的 `SLOTS` 对齐。
- **各元素何时出现** → `TIMELINE` 的 `hand1/hand2/menu/rippleN` 的 `from` / `to`。
- **片 4 的手势** → `TIMELINE.handScale` / `tip1` / `tip2` / `float`（改了 `handScale`，
  `.hand` 的 SVG 宽高由脚本自动同步，不用手改）。
- **改完别只看一帧**：`node shot2x.mjs` 抽 2x 局部、或直接从 `out/*.mp4` 抽帧看。

片子 1-3 的原视频：`382x272 / HEVC / 27.12fps / 6.49s`，硬字幕烧在画面里，
所以「改文字」只能重做画面 —— 这正是本方案干的事。
输出：`1280x912 / 30fps / H.264 + AAC`。

片子 4 是另一种活儿：用户丢来一段录屏（`884x504 / HEVC / 60fps / 4.15s`）要求
「照着做一支一样的」，于是逐帧量出几何/配色/时间轴再重建。布局坐标在
`640x365` 里量，但**成片画幅默认裁到键盘本身** `562x322`（`SCALE=2` → `1124x644`）——
参考整帧里键盘外面那圈白卡/背景，用户不要。

### 画幅：裁到键盘骨架图（片 4 专用）

片子 4 原页面画了三层：① `body` 的浅紫渐变背景 → ② `#card` 白卡（圆角+阴影）
→ ③ `#pad` 键盘底板及其内容。**默认只出第 ③ 层，并且把画幅裁到它的边界**：
视口就是 `#pad` 的框（`562x322`），舞台整体左上移 `(39,27)`，视口外的东西自然被裁掉。

```bash
TARGET=kbswitch ./run.sh              # 键盘画幅 1124x644 -> out/loveco-kbswitch-2x.mp4
                                      #   + 同画面的透明 mov -> out/loveco-kbswitch-alpha-2x.mov
FRAME=full TARGET=kbswitch ./run.sh   # 不裁，回到参考整帧 1280x730
SHELL=1 TARGET=kbswitch ./run.sh      # ①②③ 三层全画（复刻参考片，整帧 1280x730）
```

- **裁切只改视口，不改布局坐标**：`html.crop,html.crop body{width:562px;height:322px}`
  + `html.crop #stage{left:-39px;top:-27px}`（`?frame=full` 或 `?shell=1` 不加这个 class）。
  页面据此把 `TIMELINE.width/height` 报成 `562x322`，渲染器照它设视口 → 出片尺寸自动跟着走。
- 平移量必须是**整数 px** 且和 `#pad` 的 `left/top` **严格一致**，否则边上会漏 1px 透明缝；
  `#pad` 也因此从量出来的 `39.1/26.8/562.5/322.2` 圆整成 `39/27/562/322`（≤0.6px，看不出来）。
- 裁完**整帧是实心的**（`#pad` 正好铺满视口）：抽帧量 `alpha 最小值 = 255`、
  `alpha<255` 的像素数为 **0**，四角/四边中点全是 `#f2eef2`。所以 mp4 和透明 mov 画面完全一致，
  mov 只是留着以后要透明时用。
- `TARGET=kbswitch` 时 `run.sh` 会自己 `export ALPHA=1` 并用 `DERIVE_WHITE` 派生一份 mp4
  （派生不二次渲染，直接拿 mov 盖白底再编一次）。
  注意要 **export** —— 渲染器读的是 `process.env.ALPHA`；只写 shell 变量的话
  `ALPHA` 在渲染器里是 undefined，会得到「白底 H.264 装进 .mov 壳」的假透明文件。
  不想要 mp4 就 `WHITE=0`。
- 页面侧：`html,body{background:transparent}`、`#card{display:none}`；
  URL 加 `?shell=1` 切回三层（`html.shell` 那组规则），`SHELL=1` 就是替你加这个参数。
- 渲染侧：`ALPHA=1` 时 `render-cdp.mjs` 发 `Emulation.setDefaultBackgroundColorOverride`
  把底设为全透明（**不发这条 alpha 就全 255**），截图 PNG 自带 alpha；
  编码走 `qtrle + argb`（无损带 alpha 的 mov，剪辑/合成软件都吃）。
  抽帧核对时 `shot2x.mjs` 也认同一个 `ALPHA=1`。
- **底板四角是直角**（用户 2026-09-29 要求，原来是 21px 圆角）；
  只有 `html.shell ` 那套「复刻参考片」的三层版保留参考里的圆角。
- **手势尺寸/锚点跟着画幅走**：画幅从 365 高裁到 322 之后，底板下沿只剩 `y=349`，
  指尖在 `y=303`、`handScale=0.094`（手高 `458*0.094=43.1`，下沿 `346.1`，加浮动仍在板内）。
  原来是 `0.17 / 306.3`（那时手的一部分本来就被画幅底边切掉）。
  `handScale` 一改，`<svg class="hand">` 的 `width/height` 由脚本按 `339x458*handScale` 同步，
  别只改常量。
- 涟漪环在左下角会**被画幅左边/下边切掉**一点（环最大半径 56 > 圆心到边的 43/46）——
  这是「画幅=键盘」的必然结果，参照参考片没改；要完全收进画幅就把环半径改小。
- 透明素材没法直接肉眼判断（黑底/白底播放器都会骗你），用
  `python alpha-preview.py out/loveco-kbswitch-alpha-2x.mov out/xxx.png 1.0 3.4`
  合到棋盘格上看。
- **注意**：`.webm`（vp9 alpha）在本机这版 ffmpeg 里 alpha 写不进码流（抽帧退化成 RGB），
  要网页用的透明视频得另想办法。

## 目录

| 文件 | 作用 |
|---|---|
| `index.html` | 片子 1 本体（LoveCo App 教程）。所有元素都是 HTML/CSS，`window.__seek(t)` 是唯一渲染入口 |
| `index-ios.html` | 片子 2 本体（iOS 键盘教程）。同样的 `__seek` 约定，两幕 + 推入转场 |
| `index-android.html` | 片子 3 本体（安卓键盘教程）。单幕 3 行列表 + Material 开关 |
| `index-kbswitch.html` | 片子 4 本体（键盘切换）。键盘骨架 + 长按涟漪 + 淡入菜单 + 矢量手势。**默认只画最里面那层、且画幅裁到键盘**（`#pad`，562x322，四角直角）；`?frame=full` 回整帧，`?shell=1` 画背景+白卡（那时底板回到参考的圆角） |
| `assets/` | 页面用到的位图素材（`loveco-icon.png`，从原图缩到 176×176） |
| `plans/*.sh` | **配音方案**：每句文案 + 起始时间 + 段末上限 + 总时长。一个片子一份 |
| `run.sh` | 一键渲染（自动探测 ffmpeg / node / chrome），`TARGET=ios-keyboard ./run.sh` 切片子 |
| `render-cdp.mjs` | **默认渲染器**：spawn Chrome + 纯 CDP（只依赖 `ws`），逐帧 `__seek(t)` → 截图 → ffmpeg 合成。`PAGE=` 指定页面；`ALPHA=1` 出透明背景素材（截图带 alpha + `qtrle` mov）；`SHELL=1` 让页面连背景+白卡一起画；`FRAME=full` 让页面不裁画幅；`DERIVE_WHITE=<x.mp4>` 再把 mov 合成一份白底 mp4 |
| `render.mjs` | 备用渲染器（puppeteer-core），`RENDERER=puppeteer ./run.sh` 启用 |
| `render-cli.sh` | 零 Node 依赖备用方案，只用 Chrome 命令行 `?t=` 定位 |
| `probe-cursor.mjs` | 光标平滑度探针：逐帧量单帧位移峰值 / 点击命中偏差。`DUMP=1.6,1.8` 打逐帧表 |
| `shot2x.mjs` | 以 `deviceScaleFactor=2` 截某一块区域（= 成片里的真实观感），调图标/配色时用 |
| `alpha-preview.py` | 把带 alpha 的 mov/png 合到棋盘格上出预览图（透明素材不看棋盘判断不了）。`alpha-preview.py in.mov out.png 1.0 3.4` |
| `trace-hand.py` | 把一张手势/图标 PNG（带 alpha）矢量化成 SVG path（potrace）。默认裁到墨迹包围盒；`curves` 是平铺列表，整体拼一个 d 配 `evenodd`。**小尺寸几何图标（≤64px）别用这个，量出几何重画** |
| `trace-frame.py` | 从**参考视频整帧**里按颜色抠出手势/图标并矢量化，输出 line+body 双层 path。复刻录屏时用 |
| `trace-iou.py` | 调 potrace 参数时的本地预筛：展平曲线 + even-odd 栅格化算 IoU，不起 Chrome。`trace-iou.py 图.png 0.5 1.0` |
| `make-voice.sh` | 生成配音：**edge-tts（微软神经网络语音，默认）**，离线时回落 macOS `say`。`PLAN=` 选方案 |
| `out/` | 最终 MP4 |
| `audio/` | 成片用的配音（`loveco-tutorial.m4a` / `loveco-ios-keyboard.m4a` / `loveco-android-keyboard.m4a` / `loveco-kbswitch.m4a`） |

**中间产物不在工程目录**：帧序列和 Chrome profile 全部写到 `/tmp/loveco-video/`
（`frames/` + `chrome/run-*` + `voice-*/`），跑完不用管，系统会自己回收。
`TMPROOT=/path ./run.sh` 可以改位置。

## 三步走

```bash
# 1. 改文案
#    画面文字  -> index*.html 里的 HTML 正文 + TIMELINE.script（字幕）
#    配音文本  -> plans/<片子>.sh 里的 TEXTS；落点改 OFFSETS（要和 TIMELINE.events 对齐）

# 2. 生成配音（一般不用单独跑，run.sh 发现音频缺失会自动调）
TARGET=ios-keyboard ./make-voice.sh      # 或 PLAN=plans/ios-keyboard.sh ./make-voice.sh
VOICE=zh-CN-YunxiNeural ./make-voice.sh  # 换音色（男声）
ENGINE=say ./make-voice.sh               # 离线兜底（机械感重）

# 3. 渲染
./run.sh                        # 片子 1，2x -> 1280x912
TARGET=ios-keyboard ./run.sh    # 片子 2
TARGET=android-keyboard ./run.sh # 片子 3
REVOICE=1 ./run.sh              # 强制重新合成配音（默认复用已有 audio/*.m4a）
SCALE=3 ./run.sh                # 3x -> 1920x1368
NO_AUDIO=1 ./run.sh             # 只要画面
```

浏览器直接打开对应的 HTML 即可实时预览（自动循环播放）。

### 加新片子

1. 复制 `index-ios.html`（多幕 + 转场）或 `index-android.html`（单幕）当骨架，
   改 `TIMELINE`（`script` / `events` / `cursor` / `duration`）
2. 新建 `plans/<名字>.sh`，填 `TEXTS` / `OFFSETS` / `SLOTS` / `DURATION`（`SLOTS` 对齐 `script` 的段末）
3. 在 `run.sh` 顶部的 `case "$TARGET"` 里加一行
4. `TARGET=<名字> ./run.sh`

所有路径都能单独覆盖（`PAGE=` / `NAME=` / `AUDIO=` / `OUT=` / `PLAN=`），
临时想换个输出名不必改脚本。

## 为什么这样设计

- **确定性渲染**：不用 CSS animation、不用 `setTimeout`。所有状态由 `__seek(t)` 按时间算出来，
  第 N 帧永远得到同一画面，跟机器快慢无关。这是把 HTML 变成视频的前提条件。
- **改文案 = 改数据**：文案、时间点、光标轨迹全在 `TIMELINE` 里，动的是数据不是动画代码。
- **画面对齐配音**：`TIMELINE.events` 的时间点和 `make-voice.sh` 的 `OFFSETS` 一一对应。

## 配音：为什么要换掉 `say`

macOS 的 `say` 是**拼接式共振峰合成**，音调没有起伏，中文听着就是"机器人在念"。
换成 **edge-tts**（微软 Edge 的神经网络语音，免费、无需 API key）后是明显的自然度跃升：

| 方案 | 自然度 | 依赖 |
|---|---|---|
| macOS `say -v Tingting` | 机械，音调平 | 本地，离线 |
| **edge-tts `zh-CN-XiaoxiaoNeural`** | 接近真人，有轻重音和停顿 | 需联网（约 1.8s/句） |
| 商用（Azure / 火山 / MiniMax） | 更好，可情感控制 | 要 key + 计费 |

安装与试听：

```bash
pip install edge-tts
edge-tts --list-voices | grep zh-CN     # XiaoxiaoNeural / YunjianNeural / YunxiNeural …
edge-tts --voice zh-CN-XiaoxiaoNeural --text "先开启 LoveCo 键盘" --write-media /tmp/a.mp3
afplay /tmp/a.mp3
```

`make-voice.sh` 里几个关键点：

- **掐首尾静音**：edge-tts 的 mp3 前后各带几百毫秒静音，不掐掉的话起声点会飘，
  节奏对不上 `TIMELINE.events`。用 `silenceremove` + `areverse` 两侧各掐一次。
- **语速用 0%**：掐完静音后三句是 1.63 / 1.87 / 1.90s，正好落在各自字幕段内，
  不需要加速，保住模型原生的韵律。
- **脚本会自检**：合成完逐句打印"到 XXXms（段末 YYYms）"，超出就报警 ——
  改了文案忘了调 `OFFSETS`/`SLOTS` 会立刻暴露，不用等出片才发现被截断。

## 光标（手势）怎么做的

- 图标：**描边风格手势**，由参考图矢量化而来 —— `trace-hand.py`（potrace）把 PNG 描成
  一条 `fill-rule="evenodd"` 的 path（4.5KB），`viewBox` 沿用原图 `0 0 512 512`。
  墨迹包围盒 `x 92.8..431.8 / y 26.8..485.0`、指尖顶点 `(191.9, 26.8)`；
  显示 68×68（缩放 0.1328）→ `#cursor` 的 `transform-origin` 和 `TIMELINE.hotspot` 都是 `25.5, 3.6`。
- 换图流程见下方「改图标 / 调细节怎么验证」。要点：**别硬画也别去猜它属于哪个图标库**，
  用户给图就描图 —— 见 `trace-hand.py` 的用法说明。
- 定位：`#cursor` 只用 `translate3d()` 移动，不再改 `left/top` —— 走合成层、保留小数坐标，
  避免逐帧取整带来的抖动。
- 热点：`TIMELINE.hotspot` = 指尖在光标框里的位置，同时用作 `transform-origin`，
  所以点击时的缩放不会让指尖漂移；波纹圆心和指尖永远重合。
- 轨迹：`TIMELINE.cursor` 的每一帧可以写**绝对坐标** `{x,y}`，也可以写**元素锚点**
  `{el, fx, fy}`（元素包围盒内的比例位置）。锚点每帧实时求解 —— 卡片在变形/展开时
  指尖跟着目标一起走，不会脱靶。
- 平滑：每段之间用 smootherstep（首尾速度、加速度都为 0），且只在需要停顿的地方
  放两个目标相同的关键帧。单帧位移峰值 < 10px 是观感流畅的经验阈值，用探针脚本量：

```bash
node probe-cursor.mjs                       # 片子 1
node probe-cursor.mjs index-ios.html        # 片子 2
node probe-cursor.mjs index-android.html    # 片子 3
# 帧数        : 120
# 单帧位移峰值: 7.59 px  @ 0.7s -> 0.733s     OK
# 点击命中偏差: 0.00 px  @ 1.667s             OK

DUMP=1.6,1.8 node probe-cursor.mjs index-ios.html   # 打逐帧表，定位尖峰到底在哪一帧
```

两个口径值得注意：

- **只统计"看得见"的帧**（`opacity ≥ 0.05`）。手指抬起时的瞬移观众看不到，不该算卡顿 ——
  片 2 转场时就是靠这个把光标隐形挪到第二幕的。
- **命中偏差只看按下瞬间**（波纹出现后 0.05s 内）。之后指尖移开是正常动作。

## 改图标 / 调细节怎么验证

**用户直接给图（"换成这个"）→ 矢量化，别手画**

```bash
python trace-hand.py <参考图.png> [out.d.txt] [out.svg] [--nocrop]
# 轮廓数 2（外轮廓 + 内腔，平铺在同一个 d 里，用 fill-rule="evenodd"）
# 墨迹包围盒: x 92.8..431.8   y 26.8..485.0   (339.0 x 458.2)
# 裁剪偏移: 92.8 26.8        指尖(热点): (99.0, 0)   裁后画布: 339 x 458
```

输出的几个数字直接决定手 SVG 的 `viewBox`/尺寸、`TIMELINE.tipPath` 和 `handScale`。
描出来的 path 和原图基本像素级一致，比找图标库 / 手画都快且准。

**两个必踩的坑**：
1. potracer 的 `path.curves` 是**平铺**列表（外轮廓和孔洞是兄弟，`children` 恒空）。
   必须整列表拼进同一个 d 配 `evenodd`；把每条 curve 单画会得到「整只手剪影 + 手掌内腔」
   两块实心图形，完全不是原图。
2. 想「肉色实体手」就再加一层：`fill_holes(mask)` 后 trace 出剪影铺在底下。
   指缝在这个图里是封闭口袋，会被 `fill_holes` 一起填掉，正好得到完整手掌。

**描完必须量 IoU，别用眼睛**：把 d 塞进 `339x458` 的 svg 截 1x 图，跟原图裁剪图
二值化后比 —— 片子 4 的 0.9925 才算合格。（`shot2x.mjs` 的 clip 超出 layout
viewport 的部分会截成**空白**，多面板对比页一超过 640 宽就会误判成"描漏了"。）

**别靠脑补，也别在 1x 下看**——成片是 2x 渲染的，1x 看着还行的小图标在 1280 宽下可能糊。
用 `shot2x.mjs` 直接截成片尺寸的局部，一轮就能判断：

```bash
NODE_MODULES=… CHROME=… node shot2x.mjs \
  "file://$PWD/index.html?t=2.05" /tmp/hand.png 490 120 110 110 3
# → 裁剪 CSS 区域 (490,120) 110x110，放大 3 倍
```

选图标时先做一张候选页（把各方案按 2x 尺寸和真实参照物一起摆出来）再截图对比，
比逐个改进 `index.html` 快得多 —— 本次手势图标就是这么筛出来的。

## 片子 1：LoveCo App 教程（`index.html`，6.5s）

```
0.00 ─────────── 1.62 ── 2.20 ────── 3.35 ──── 5.35 ── 5.75 ── 6.50
 设置列表页         详情页   展开"完整体验模式"  光标退场   对勾弹出   结束
 字幕1              字幕2                字幕3
```

| 事件 | 时间 | 说明 |
|---|---|---|
| `enterDetail` | 1.62 | 列表页 → LoveCo 详情页（卡片上移 + 高度 178→89） |
| `tapToggle1` / `toggle1On` | 1.98 / 2.16 | 点「启用LoveCo」并打开 |
| `addRow2` | 2.20 | 「完整体验模式」行出现（高度 89→178） |
| `tapToggle2` / `toggle2On` | 2.90 / 3.05 | 点「完整体验模式」并打开 |
| `cursorOut` | 3.35 | 光标淡出 |
| `doneIn` / `doneFull` | 5.35 / 5.75 | 绿色对勾弹出 |

| 段 | 字幕 / 配音 | 语音落点 |
|---|---|---|
| 1 | 先开启 LoveCo 键盘 | 0.06 – 1.69 |
| 2 | 再打开完整体验模式 | 2.06 – 3.93 |
| 3 | 完成后返回 LoveCo App | 4.30 – 6.20 |

> `tapToggle2` 从 2.62 挪到 2.90：光标从开关 1 滑到开关 2 需要 0.6s 才不显急，
> 原来的 0.42s 会让单帧位移冲到 20px+，看起来一卡一卡。

## 片子 2：iOS 启用 LoveCo 键盘（`index-ios.html`，7.0s）

```
0.00 ──── 1.62 ─ 1.70 ──────── 2.16 ── 3.00 ── 3.22 ────── 4.80 ── 5.20 ── 6.10 ─ 7.00
 设置列表(4行)  点键盘   推入转场      设置页就位  开键盘  弹出允许完全访问  点它   退场  对勾  结束
 字幕1                                  字幕2                    字幕3
```

| 事件 | 时间 | 说明 |
|---|---|---|
| `tapKey` | 1.62 | 点第 4 行「键盘」（前 3 行是骨架 UI） |
| `curHide0/1` | 1.60 / 1.70 | 光标淡出（抬指）——**必须在整屏移动前淡干净** |
| `pushT0/T1` | 1.70 / 2.16 | 推入转场：A 幕 `translateX(0→-640)`，B 幕 `translateX(640→0)` |
| `curShow0/1` | 2.16 / 2.30 | 光标淡入（落指），转场停稳之后才出现 |
| `tapKb` / `kbOn` | 3.00 / 3.12 | 打开「LoveCo 键盘」开关 |
| `addFull` | 3.22 | 「允许完全访问」组高度 0→76 展开 |
| `tapFull` / `fullOn` | 4.80 / 4.92 | 打开「允许完全访问」开关 |
| `cursorOut` | 5.20 | 光标淡出 |
| `doneIn` / `doneFull` | 6.10 / 6.45 | 绿色对勾弹出（在卡片下方留白里，不盖住内容） |

| 段 | 字幕 / 配音 | 语音落点 |
|---|---|---|
| 1 | 先打开设置里的键盘 | 0.06 – 1.88 |
| 2 | 再开启 LoveCo 键盘 | 2.29 – 3.86 |
| 3 | 最后允许完全访问 | 4.48 – 6.07 |

设计要点：

- **骨架 UI**：前 3 行是「灰图标块 + 灰文字条 + 灰箭头」，三条文字条宽度故意不同（152/104/176），
  整体才像"内容没加载完"而不是复制粘贴。第 4 行是真行：灰底圆角方块 + 白色实心键盘 + 文字 + 箭头。
- **亮色配色令牌**（参考图是暗色，按要求转亮）：页底 `#f2f4f6→#f8f9fa` 渐变、卡片纯白、
  正文 `#1f1f21`、分隔线 `#e8e8ec`、骨架块 `#e4e4e9`、箭头 `#c6c6cc`。
  开关打开是 iOS 绿 `#34c759`（不是片 1 的品牌蓝）。
  （`--muted` / `--blue` 两个变量保留着备用，目前只给删掉的说明文案用过。）
- **第二幕只有两组卡片**：「LoveCo 键盘」（开关）+「允许完全访问」（开关，`top:168px`）。
  两组之间留 30px 分组间距 —— 别和行内分隔线搞混。
  参考图里那段「这些键盘在使用时可以访问你键入的所有数据…」的提示语按用户要求已删掉；
  删掉后空出来的下半屏正好放收尾的绿勾（`#done` 在 `top:330px`）。
- **推入转场**：两幕各是一个绝对定位铺满的图层，靠 `translateX` 滑动。因为没有 CSS transition，
  两边都由 `push` 进度（`ease` 缓动）算出来，仍是确定性的。
- **转场前后的光标**：`age` 一致的两个关键帧表达"停在原地"，转场期间用隐形瞬移换锚点。
  踩过的坑：一开始把 `#tgKb`（第二幕的开关）当下一帧目标写在 2.00，但它在转场中还在屏幕右侧，
  插值会把光标往右拽，1.667s 时就偏了 12.98px、单帧冲到 33.6px。**先淡干净、再换锚点**就好了。
- **点「键盘」行的波纹只给 0.26s**（其余点击 0.42s）：波纹锚在该行上，会跟着整屏滑出去，
  不缩短会很扎眼。
- **入场点**别放在目标行上（原来放 (566,300) 正好压在「键盘」行，看起来像"光标本来就在那"）。
  改成从卡片右下方 `(556,380)` 进来，手指从留白区升上来。

## 片子 3：安卓启用 LoveCo 键盘（`index-android.html`，4.0s）

单幕，没有转场：光标从卡片右下角升起 → 落到第 2 行 LoveCo 的开关上 → 点一下 → 开关变蓝 → 绿勾。

```
0.00 ─────────── 1.45 ─ 1.65 ─ 1.78 ───── 2.30 ── 2.65 ── 3.00 ── 4.00
 3 行列表（第 2 行 LoveCo）  光标到位  点击  开关变蓝  光标退场  对勾  结束
 字幕：点击开启 LoveCo 键盘（末尾 0.22s 淡出，给对勾让位）
```

| 事件 | 时间 | 说明 |
|---|---|---|
| `tapToggle` | 1.65 | 点第 2 行 LoveCo 的开关 |
| `toggleOn` | 1.78 | 蓝底从左往右长满（0.22s）+ 白点滑过去 |
| `cursorOut` | 2.30 | 光标淡出 |
| `doneIn` / `doneFull` | 2.65 / 3.00 | 绿色对勾弹出 |

| 段 | 字幕 / 配音 | 语音落点 |
|---|---|---|
| 1 | 点击开启 LoveCo 键盘 | 0.22 – 2.26（段末 2.55，余量 0.29s） |

设计要点：

- **布局比例是从参考图量的，不是估的**：行高 108、图标 62、开关 80×46、行内边距 26、
  卡片 592×324（即 3 行）。参考图是 670×396 的设置页截图，`card 632 / 行高 120.5 /
  图标 69 / 开关 83×48`，按卡片宽度同比缩到 592 就得到上面这组数。
- **没有行内分隔线**。Material 3 的设置列表本来就不画线（量过参考图，行与行之间是纯白），
  别照 iOS 那套补分隔线。
- **Android 开关是「灰轨 + 白点」**，不是 iOS 那种整块变色胶囊。结构分三层：
  `.track`（灰底）+ `.fill`（蓝，宽度 0→100% 长出来）+ `.knob`（白点，left 4→38）。
  蓝色 `#3782ff`、灰轨 `#e3e5e8` 都是从参考图取像素中位数得到的。
- **位图素材直接引用，不要矢量化**：LoveCo 图标是彩色 app icon，`assets/loveco-icon.png`
  （原图 512×512 缩到 176×176，33KB，够 2x 渲染用），页面里 `border-radius:15px` 裁成圆角方块。
  `trace-hand.py` 那套 potrace 矢量化**只适合单色线条图标**（比如手势光标），彩色图描出来会糊。
- **骨架行**：灰图标块 + 灰文字条（178 / 136 两种宽度）+ 灰开关胶囊，和真行同尺寸，
  这样"少的那两行"才像没加载完而不是缺内容。
- 绿勾（`#done`）落在卡片下沿 348 之后的留白里，`top:400px`，上下各留 10 / 15px。

## 改文案

改 `plans/<片子>.sh` 的 `TEXTS` 后 `make-voice.sh` 会自己量时长并校验是否超出 `SLOTS`；要手动量：

```bash
edge-tts --voice zh-CN-XiaoxiaoNeural --text "先打开设置里的键盘" --write-media /tmp/l1.mp3
afinfo /tmp/l1.mp3 | grep duration
```

## 依赖

- Node.js ≥ 22（渲染器只用内置模块 + `ws`）
- Chrome（优先 `~/Library/Caches/ms-playwright/chromium-*/…/Google Chrome for Testing`，
  不在 `/Applications`，受限环境里更不容易被拦）
- ffmpeg（`brew install ffmpeg`，或用 `FFMPEG=` 指定；没装可 `pip install imageio-ffmpeg`）
- Python `edge-tts`（配音，需联网；离线自动回落 macOS `say`）

## 换成别的视频怎么办

这套流程对「UI 演示 / 教程 / 数据动画」这类**画面可以用代码描述**的视频都适用：

1. 抽帧看结构：`ffmpeg -i in.mp4 -vf fps=2 f_%03d.jpg`，数出有哪几个场景
2. 采样颜色/坐标：直接用 Python + Pillow 量，别靠眼睛估
3. 把每个场景写成 HTML，用 `__seek(t)` 按时间算状态
4. `make-voice.sh` 换文案，`run.sh` 出片

画面里如果有**真实录制内容**（摄像头、真人操作、复杂实拍），HTML 复刻就不划算了，
那时候改走「ffmpeg 遮盖原字幕 + 重新配音 + 新字幕」的路子。

## 清理

工程目录里不留任何中间产物：帧序列、Chrome profile、TTS 中间音频都在 `/tmp/loveco-video/`
（`frames/`、`chrome/`、`voice-<NAME>/`、`check/`），系统会自己回收，不用手动删。
工程里只留源码 + `plans/` + `audio/`（成片配音）+ `out/`（成片）。

## 复刻一支现成的录屏（片子 4 的做法，可套用）

用户丢来一段 mp4/gif 说「照着做一支一样的」时，**不要凭眼看**。整个流程是
「先把参考片量成数，再按数写页面」：

```bash
# 0. 抽帧到 /tmp（全帧 + 关键段细帧）
FF=.../ffmpeg; mkdir -p /tmp/ref/all
"$FF" -y -i ref.mov -vsync 0 /tmp/ref/all/%03d.png      # 全帧
"$FF" -y -ss 1.9 -i ref.mov -t 1.4 -vf fps=15 /tmp/ref/s_%02d.png   # 细看某段
```

1. **量整体比例和卡片边界**。用 numpy 逐行/逐列扫「与背景色的差」，超过阈值
   的即实体。注意**阴影会把边界撑大**：先用低阈值看轮廓、再用高阈值看实体，
   两者的差就是阴影厚度。片子 4 由此得到「淡紫底 + 一张 16:9 白卡片 + 内部
   浅灰键盘面板」的三层结构，以及卡片圆角 R。
2. **量内部元素**。沿一列扫灰度能一次拿到所有横向分界（几行按键、按钮上下沿）；
   沿一行扫能拿到所有纵向分界（每列按键的 x/宽度/间隙）。片子 4 量出
   `9 列 × 3 行`、行高 55/55/86、列宽 66 间隙 14.5、底部地球键 + 蓝色胶囊。
3. **量文字**。黑像素 bbox 直接给出标题的宽高和中心；再换算成 `font-size`。
   参考里的白描边黑字用 **SVG `paint-order="stroke"`** 做，两层 text 叠：
   外层白描边（宽）+ 内层同色描边（把笔画加粗到参考的厚度）。
   宽度用 `textLength="…" lengthAdjust="spacingAndGlyphs"` **强制对齐**，
   比反复调 `letter-spacing` 靠谱得多（PingFang SC 只有 6 个字重，没有 Heavy）。
4. **量时间轴**。写个脚本对每一帧算几个特征（皮肤像素数 / 标题黑像素数 /
   菜单区平均色 / 按钮区蓝像素数），打印「状态发生变化」的时刻表 —— 这就是
   events 的真实时间点。片子 4 由此得到：
   `手 0.30 出现 / 标题 2.22 换句 / 手 2.33 离开 / 菜单 2.45–2.95 淡入 / 手 2.97 回来`
   （两处切换都是**硬切**，不是淡入淡出 —— 照做）。
5. **抠素材**。卡通手势这类东西不要手画，两条路：
   - 参考片里有 → `trace-frame.py` 从最干净的一帧按颜色抠出来矢量化，输出 line（剪影，
     深色填充）+ body（本体，主色填充）两层，叠起来就是原图的描边厚度和圆角：
     ```bash
     python trace-frame.py --frame /tmp/ref/all/230.png --box 294 244 440 352 \
         --hue skin --out /tmp/ref/hand      # -> hand.line.txt / hand.body.txt
     ```
   - 用户另给了图 → `trace-hand.py` 描那张 PNG（见下方「换手势图标」）。
   页面里 `<svg viewBox="…">` 放两层 path，`width/height` = 素材尺寸×缩放；
   `TIMELINE.tipPath` 填指尖在 viewBox 里的坐标，`handScale` = 缩放，
   `placeHand()` 用 `left = tip - tipPath×scale` 让指尖压在触点上。
6. **对照迭代**。每改一轮就 `?t=` 定位抽同刻帧，和参考帧并排拼图看，
   再用 numpy 量一次关键 bbox（标题宽高、卡片边界、按钮上下沿）对数值 ——
   目测在缩略图上完全不可靠，数值才作数。片子 4 一共对了 4 轮：
   字号 81→55、卡片圆角 51→34、按键行高 62→40、标题基线 163→158。

### 换手势图标（片子 4 的第二版手）

第一版手是用 `trace-frame.py` 从参考帧里抠的真人手，颗粒感重，被否掉。第二版换成
用户直接给的**描边风格手势图标**（512×512，只有 alpha 有形状，RGB 全黑）：

```bash
python trace-hand.py /path/hand.png /tmp/loveco-video/hand2.d.txt /tmp/loveco-video/hand2.svg
# 轮廓数 2（外轮廓 + 内腔，平铺）  path 长度 2069
# 墨迹包围盒 x 92.8..431.8  y 26.8..485.0
# 裁剪偏移 92.8 26.8     指尖(热点) (99.0, 0)     裁后画布 339 x 458
```

- `viewBox="0 0 339 458"`（脚本默认裁到墨迹包围盒，页面里不留空白），`width/height` = ×0.17。
- **最终形态是「只有描边、内部透明」**（用户后来明确要求「不需要肉色填充，透明就行」，
  这样键盘/菜单能从手里透出来）。做法就是只留 `.line` 那一层，把 `.fill` 剪影层和
  `.hand .fill` 的 CSS 删掉。上面那段「两层叠出肉色实体」是历史版本，已弃用。
- `tipPath: [99, 0]`（指尖就在裁剪框顶边）、`handScale: 0.17`。
- **尺寸怎么定**：手是竖向的（339×458），指尖又必须压在左下角地球键上，
  所以画面下方只剩 ~59px 可用。把 0.14 / 0.17 / 0.20 / 0.24 四档渲染出来并排看，
  0.17 时手掌基本完整、线条又不细，选它（0.20 起手掌就被下边缘切掉了）。
- 验证：把 d 单独塞进 339×458 的 svg 截图，跟原图裁剪图算 IoU → **0.9925**。

### 换地球图标（片子 4 的第三版）

`icons8-globe-50.png`（50×50，46×46 墨迹，线条只有 ~2.4px）**没有描**：
小尺寸几何图标描出来在 4x 栅格上 IoU 有 0.93，但那是「细线对亚像素误差最敏感」的假象，
导到成片尺寸就是一圈疙瘩。改成**逐行扫墨迹段量出几何再重画**：

```bash
# 逐行打印 (起,止) 段，直接把每个原语反解出来
y= 5 [(13,16),(19,20),(24,25),(29,30),(33,36)]   # 圆 + 两经线 + 中竖线
y=14 [(4,6),(14,35),(43,45)]                     # 圆 + 上纬线（x14..35 一条实心带）
y=24 [(2,47)]                                    # 赤道，跨满整宽
```

量出来的结构：**圆**（外沿 2..47.8 → 圆心 24.9、半径 22.9）＋**一条经线椭圆**
（rx=11.2、ry=21.9，一个椭圆同时给出左右两条经线）＋**中竖线**＋**赤道**＋
**两条纬线弧**（过上纬线三点 (9,12)(25,14.8)(40,12) 反解出 R=47.11，圆心在 y=−32.3）。
裁到墨迹包围盒后 `viewBox="0 0 46 46"`，位置 `left:60.7 top:281.4 width:42.7`。

**线宽不能用二值 IoU 挑**（抗锯齿会把渲染图撑胖，IoU 随线宽单调下降 → 永远挑最细的错的）。
改用**墨迹质量**：原图 `sum(alpha)/255 = 727.0`，渲染 `sum((255−gray)/255)`，
让两边总量相等 → **`stroke-width="2.0"` 时 719.1（98.9%）**，二值漏描只剩 6px。
颜色沿用原来的 `#4b4b53`（量参考帧的线条核心是 `#4a4c53`，差 1/255）。

参考片里的**涟漪**（长按时的扩散环）细节：3 个同心圆环循环扩散，半径 12→56，
越外越淡，中心另有一颗低透明度实心点；两处手势都有。参考里是橙红色
`rgb(233,139,121)`，本项目按品牌改成蓝色 `#0a6cf5`（同时改了 `#ttl2` 里的
`LoveCo` 用 `#0a6cf5`）。注意 `#ripple` 在 DOM 里排在 `#menu` 之前，
所以第二处（点 LoveCo 时）的涟漪只露出菜单外的弧段 —— 参考里它是压在菜单上的，
要改就得把 `#ripple` 挪到 `#menu` 后面（蓝色环压在蓝色高亮行上会看不见，故未动）。
