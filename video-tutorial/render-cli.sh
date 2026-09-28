#!/bin/zsh
# 备用渲染器：不依赖 Puppeteer，直接用本机 Chrome 的 headless 截图模式
# 每帧启动一次 Chrome，用 ?t=秒数 让页面定位到该时刻后截图。
# 慢（约 0.3~1s/帧），但零 Node 依赖。
#
# 用法: ./render-cli.sh [/path/to/output.mp4]
set -e
cd "$(dirname "$0")"

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
FFMPEG="${FFMPEG:-ffmpeg}"
FPS=30
DURATION=6.5
W=640
H=456
SCALE=2
OUT="${1:-out/lovekey-tutorial-cli.mp4}"

PROFILE="$PWD/.chrome-profile"      # 用项目内目录，避免污染系统配置
mkdir -p frames out "$PROFILE"

TOTAL=$(python3 -c "print(round($DURATION*$FPS))")
echo "[render-cli] $TOTAL frames @ ${FPS}fps, chrome=$CHROME"

for i in $(seq 0 $((TOTAL-1))); do
  T=$(python3 -c "print($i/$FPS)")
  "$CHROME" --headless --disable-gpu --hide-scrollbars --no-first-run \
    --no-default-browser-check --disable-component-update \
    --user-data-dir="$PROFILE" \
    --window-size=$W,$H --force-device-scale-factor=$SCALE \
    --screenshot="$PWD/frames/f_$(printf '%05d' $i).png" \
    "file://$PWD/index.html?t=$T" >/dev/null 2>&1
  [ $((i % 10)) -eq 0 ] && printf "\r  %d/$TOTAL" $i
done
printf "\r  %d/%d\n" $TOTAL $TOTAL

$FFMPEG -y -framerate $FPS -i frames/f_%05d.png -frames:v $TOTAL \
  -i audio/voice.m4a \
  -c:v libx264 -preset medium -crf 17 -pix_fmt yuv420p -movflags +faststart \
  -c:a aac -b:a 160k -shortest "$OUT"
echo "[done] $OUT"
