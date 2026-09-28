#!/bin/zsh
# 一键渲染。自动找 ffmpeg / node / chrome。
#   ./run.sh            # 2x -> 1280x912
#   SCALE=3 ./run.sh    # 3x -> 1920x1368
#   NO_AUDIO=1 ./run.sh # 只出画面
#   REVOICE=1 ./run.sh  # 强制重新合成配音（默认复用 audio/voice.m4a）
#   TMPROOT=/x ./run.sh # 改中间产物位置（默认 /tmp/loveco-video，系统自动回收）
# 默认走 render-cdp.mjs（纯 CDP，不需要 puppeteer）；RENDERER=puppeteer 可切回 render.mjs
set -e
setopt NULL_GLOB          # 通配符没匹配到不要报错退出
cd "$(dirname "$0")"

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

echo "ffmpeg : $FFMPEG"
echo "chrome : $CHROME"
echo "node   : $NODE"

# ---- 配音 ----
# 默认只在 audio/voice.m4a 缺失时生成；改了文案/音色就用 REVOICE=1 ./run.sh 强制重生成
if [[ -z "$NO_AUDIO" ]]; then
  if [[ "$REVOICE" == "1" || ! -f audio/voice.m4a ]]; then
    ./make-voice.sh
  else
    echo "voice  : 复用 audio/voice.m4a（要重新合成用 REVOICE=1 ./run.sh）"
  fi
fi

if [[ "$RENDERER" == "puppeteer" ]]; then
  "$NODE" render.mjs
else
  "$NODE" render-cdp.mjs
fi
