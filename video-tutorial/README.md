# HTML → 视频 复刻流水线（LoveCo 版）

把「HTML + CSS + JS」逐帧渲染成 MP4，用来改文案 / 换配音，**不用录屏、不用剪辑软件**。

原视频：`382x272 / HEVC / 27.12fps / 6.49s`，硬字幕烧在画面里，
所以「改文字」只能重做画面 —— 这正是本方案干的事。
输出：`1280x912 / 30fps / 6.5s / H.264 + AAC`。

## 目录

| 文件 | 作用 |
|---|---|
| `index.html` | 视频本体。所有元素都是 HTML/CSS。`window.__seek(t)` 是唯一渲染入口 |
| `run.sh` | 一键渲染（自动探测 ffmpeg / node / chrome） |
| `render-cdp.mjs` | **默认渲染器**：spawn Chrome + 纯 CDP（只依赖 `ws`），逐帧 `__seek(t)` → 截图 → ffmpeg 合成 |
| `render.mjs` | 备用渲染器（puppeteer-core），`RENDERER=puppeteer ./run.sh` 启用 |
| `render-cli.sh` | 零 Node 依赖备用方案，只用 Chrome 命令行 `?t=` 定位 |
| `probe-cursor.mjs` | 光标平滑度探针：逐帧量单帧位移峰值 / 点击命中偏差 |
| `shot2x.mjs` | 以 `deviceScaleFactor=2` 截某一块区域（= 成片里的真实观感），调图标/配色时用 |
| `make-voice.sh` | 生成配音：**edge-tts（微软神经网络语音，默认）**，离线时回落 macOS `say` |
| `out/` | 最终 MP4：`loveco-tutorial-2x.mp4` |

**中间产物不在工程目录**：帧序列和 Chrome profile 全部写到 `/tmp/loveco-video/`
（`frames/` + `chrome/run-*`），跑完不用管，系统会自己回收。
`TMPROOT=/path ./run.sh` 可以改位置。

## 三步走

```bash
# 1. 改文案
#    画面文字  -> index.html 里的 HTML 正文 + TIMELINE.script（字幕）
#    配音文本  -> make-voice.sh 里的 TEXTS；落点改 OFFSETS（要和 TIMELINE.events 对齐）

# 2. 生成配音
./make-voice.sh                          # 默认 edge-tts + zh-CN-XiaoxiaoNeural
VOICE=zh-CN-YunxiNeural ./make-voice.sh  # 换音色（男声）
ENGINE=say ./make-voice.sh               # 离线兜底（机械感重）

# 3. 渲染
./run.sh                 # 2x -> 1280x912；voice.m4a 缺失时自动先合成
REVOICE=1 ./run.sh       # 强制重新合成配音
SCALE=3 ./run.sh         # 3x -> 1920x1368
NO_AUDIO=1 ./run.sh      # 只要画面
```

浏览器直接打开 `index.html` 即可实时预览（自动循环播放）。

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
edge-tts --voice zh-CN-XiaoxiaoNeural --text "先开启 LoveCo 功能" --write-media /tmp/a.mp3
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

- 图标：**一条闭合路径画整只手**（食指竖起 + 三处指节隆起 + 拇指），
  热区/视觉上是一个整体。别用「多个子形状 + 同色描边 + 填充」去拼——
  相邻形状的描边会互相盖住，小尺寸下必然糊成一坨（这是第一版的翻车原因）。
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
node probe-cursor.mjs
# 帧数        : 195
# 单帧位移峰值: 9.25 px  @ 2.533s -> 2.567s   OK
# 点击命中偏差: 0.00 px                        OK
```

## 改图标 / 调细节怎么验证

**别靠脑补，也别在 1x 下看**——成片是 2x 渲染的，1x 看着还行的小图标在 1280 宽下可能糊。
用 `shot2x.mjs` 直接截成片尺寸的局部，一轮就能判断：

```bash
NODE_MODULES=… CHROME=… node shot2x.mjs \
  "file://$PWD/index.html?t=2.05" /tmp/hand.png 490 120 110 110 3
# → 裁剪 CSS 区域 (490,120) 110x110，放大 3 倍
```

选图标时先做一张候选页（把各方案按 2x 尺寸和真实参照物一起摆出来）再截图对比，
比逐个改进 `index.html` 快得多 —— 本次手势图标就是这么筛出来的。

## 时间轴

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

> `tapToggle2` 从 2.62 挪到 2.90：光标从开关 1 滑到开关 2 需要 0.6s 才不显急，
> 原来的 0.42s 会让单帧位移冲到 20px+，看起来一卡一卡。

## 当前文案

| 段 | 时间 | 字幕 / 配音 |
|---|---|---|
| 1 | 0.06 – 1.69 | 先开启 LoveCo 功能 |
| 2 | 2.06 – 3.93 | 再打开完整体验模式 |
| 3 | 4.30 – 6.20 | 完成后返回 LoveCo App |

改 `TEXTS` 后 `make-voice.sh` 会自己量时长并校验是否超出 `SLOTS`；要手动量：

```bash
edge-tts --voice zh-CN-XiaoxiaoNeural --text "先开启 LoveCo 功能" --write-media /tmp/l1.mp3
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

工程目录里不留任何中间产物：帧序列、Chrome profile、临时音频都在 `/tmp/loveco-video/`
（`frames/`、`chrome/`、`voice/`、`check/`），系统会自己回收，不用手动删。
