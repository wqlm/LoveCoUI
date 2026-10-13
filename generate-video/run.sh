#!/bin/zsh
# 一键渲染。自动找 ffmpeg / node / chrome。
#
#   ./run.sh                          # 默认片子：LoveCo App 教程 2x -> 1280x912
#   TARGET=ios-keyboard ./run.sh      # iOS 键盘教程 -> out/loveco-ios-keyboard-2x.mp4
#   TARGET=android-keyboard ./run.sh  # 安卓键盘教程 -> out/loveco-android-keyboard-2x.mp4
#   TARGET=kbswitch ./run.sh          # 键盘切换（裁到键盘 1124x644）-> out/loveco-kbswitch-2x.mp4
#                                     #   + 同画面的透明 mov（out/loveco-kbswitch-alpha-2x.mov）
#   SHELL=1 TARGET=kbswitch ./run.sh  # 复刻参考片的三层外观（整帧 1280x730）-> -shell-2x.mp4
#   FRAME=full TARGET=kbswitch ./run.sh   # 不裁，回到整帧 1280x730
#   SCALE=3 ./run.sh                  # 3x -> 1920x1368
#   NO_AUDIO=1 ./run.sh               # 只出画面
#   ALPHA=1 ./run.sh                  # 透明背景素材 -> out/<name>-alpha-<n>x.mov（qtrle 带 alpha）
#   SHELL=1 ./run.sh                  # 连背景+白卡一起出（复刻参考片的三层外观）-> out/<name>-shell-<n>x.mp4
#   FRAME=full ./run.sh               # 页面不裁画幅（片 4 默认裁到键盘）
#   WHITE=1 ./run.sh                  # ALPHA=1 时再派生一份白底 mp4（片 4 默认就开；WHITE=0 关）
#   REVOICE=1 ./run.sh                # 强制重新合成配音（默认复用已有 audio/*.m4a）
#   TMPROOT=/x ./run.sh               # 改中间产物位置（默认 /tmp/loveco-video，系统自动回收）
#
# 默认（不加参数）= 只出画面里最里面那一层（键盘底板及内容），并且把画幅裁到它本身。
# 注意 mp4(H.264) 装不下 alpha：不发 background override 时 Chrome 会把透明处垫成 **白底**。
# 片 4 的画幅已经裁到键盘、整帧是实心的（alpha 全 255），所以 mp4 就是正经成片；
# 同时还是出一份 qtrle mov 留着以后要透明时用（片 4 默认 ALPHA=1 + DERIVE_WHITE）。
# 不想要那份派生 mp4 就 WHITE=0；出片尺寸跟着页面报的 TIMELINE.width/height 走。
#
# 一个工程里可以有多个 TARGET，每个对应：一个 HTML + 一份配音方案 + 一个输出名
#   TARGET=tutorial          PAGE=index.html          PLAN=plans/tutorial.sh          NAME=loveco-tutorial
#   TARGET=ios-keyboard      PAGE=index-ios.html      PLAN=plans/ios-keyboard.sh      NAME=loveco-ios-keyboard
#   TARGET=android-keyboard  PAGE=index-android.html  PLAN=plans/android-keyboard.sh  NAME=loveco-android-keyboard
# 上面每一项都能用同名环境变量单独覆盖（例如只想改输出名：NAME=xxx ./run.sh）。
#
# 默认走 render-cdp.mjs（纯 CDP，不需要 puppeteer）；RENDERER=puppeteer 可切回 render.mjs
set -e
setopt NULL_GLOB          # 通配符没匹配到不要报错退出
cd "$(dirname "$0")"

# ---- 片子 ----
TARGET="${TARGET:-tutorial}"
case "$TARGET" in
  ios-keyboard)     _PAGE=index-ios.html;     _PLAN=plans/ios-keyboard.sh;     _NAME=loveco-ios-keyboard ;;
  android-keyboard) _PAGE=index-android.html; _PLAN=plans/android-keyboard.sh; _NAME=loveco-android-keyboard ;;
  kbswitch)         _PAGE=index-kbswitch.html; _PLAN=plans/kbswitch.sh;         _NAME=loveco-kbswitch ;;
  tutorial|*)       _PAGE=index.html;         _PLAN=plans/tutorial.sh;         _NAME=loveco-tutorial ;;
esac
export SCALE="${SCALE:-2}"
export PAGE="${PAGE:-$_PAGE}"
export NAME="${NAME:-$_NAME}"
export AUDIO="${AUDIO:-audio/$NAME.m4a}"
# 片 4 的内容层没有自带背景，mp4 会把透明处垫白 —— 那正是用户不要的东西，
# 所以这个片子的默认渲染就是「带 alpha 的 mov」。
# 注意必须 export：渲染器读的是 process.env.ALPHA，不是 shell 变量。
if [[ "$TARGET" == "kbswitch" && "$SHELL" != "1" && "$ALPHA" != "1" ]]; then
  export ALPHA=1
fi
# ALPHA=1 -> 透明背景素材（带 alpha 通道的 mov），文件后缀必须给对，
# 渲染器按后缀选编码：.mov = qtrle(带 alpha)，.webm = vp9 alpha
if [[ "$ALPHA" == "1" ]]; then
  export OUT="${OUT:-out/$NAME-alpha-${SCALE}x.mov}"
  # 顺手由透明 mov 派生一份白底 mp4（不二次渲染）。
  # 片 4 画幅已经裁到键盘本身、整帧是实心的，两者画面完全一致，
  # 所以普通 mp4 直接用常规名字；其它片子要 WHITE=1 才出（叫 -white-）。
  if [[ "$WHITE" == "1" ]]; then
    export DERIVE_WHITE="${DERIVE_WHITE:-out/$NAME-white-${SCALE}x.mp4}"
  elif [[ "$TARGET" == "kbswitch" && "$WHITE" != "0" ]]; then
    export DERIVE_WHITE="${DERIVE_WHITE:-out/$NAME-${SCALE}x.mp4}"
  fi
elif [[ "$SHELL" == "1" ]]; then
  export OUT="${OUT:-out/$NAME-shell-${SCALE}x.mp4}"
else
  export OUT="${OUT:-out/$NAME-${SCALE}x.mp4}"
fi
export PLAN="${PLAN:-$_PLAN}"
export VOICE_OUT="${VOICE_OUT:-$AUDIO}"
export VOICE_TMPDIR="${VOICE_TMPDIR:-/tmp/loveco-video/voice-$NAME}"

# ---- ffmpeg ----
if [[ -z "$FFMPEG" ]]; then
  if command -v ffmpeg >/dev/null; then
    FFMPEG=$(command -v ffmpeg)
  else
    FFMPEG=$(ls -d /Users/wqlm/.workbuddy/binaries/python/envs/default/lib/python3.13/site-packages/imageio_ffmpeg/binaries/ffmpeg-* 2>/dev/null | head -1)
  fi
fi
[[ -x "$FFMPEG" ]] || { echo "找不到 ffmpeg，请 brew install ffmpeg 或设置 FFMPEG=/path/to/ffmpeg"; exit 1; }
export FFMPEG

# ---- node ----
NODE="${NODE:-/Users/wqlm/.workbuddy/binaries/node/versions/22.22.2-3/bin/node}"
command -v "$NODE" >/dev/null || NODE=$(command -v node)
export NODE_MODULES="${NODE_MODULES:-/Users/wqlm/.workbuddy/binaries/node/workspace/node_modules}"

# ---- chrome ----
# 优先用 Playwright 自带的 Chrome for Testing：它不在 /Applications，
# 不触发 code_sign_clone 清理，受限/沙箱环境里也能起来
if [[ -z "$CHROME" ]]; then
  for c in \
    "$HOME/Library/Caches/ms-playwright"/chromium-*/chrome-mac-arm64/"Google Chrome for Testing.app"/Contents/MacOS/"Google Chrome for Testing" \
    "$HOME/Library/Caches/ms-playwright"/chromium-*/chrome-mac/"Google Chrome for Testing.app"/Contents/MacOS/"Google Chrome for Testing" \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  do
    [[ -x "$c" ]] && { CHROME="$c"; break; }
  done
fi
[[ -x "$CHROME" ]] || { echo "找不到 Chrome，请设置 CHROME=/path/to/chrome"; exit 1; }
export CHROME

echo "target : $TARGET  ($PAGE -> $OUT)"
echo "ffmpeg : $FFMPEG"
echo "chrome : $CHROME"
echo "node   : $NODE"

# ---- 配音 ----
# 默认只在目标音频缺失时生成；改了文案/音色就用 REVOICE=1 ./run.sh 强制重生成
if [[ -z "$NO_AUDIO" ]]; then
  if [[ "$REVOICE" == "1" || ! -f "$AUDIO" ]]; then
    ./make-voice.sh
  else
    echo "voice  : 复用 $AUDIO（要重新合成用 REVOICE=1 ./run.sh）"
  fi
fi

if [[ "$RENDERER" == "puppeteer" ]]; then
  "$NODE" render.mjs
else
  "$NODE" render-cdp.mjs
fi
