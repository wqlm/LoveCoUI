#!/bin/zsh
# 备用渲染器：不依赖 Puppeteer，直接用本机 Chrome 的 headless 截图模式
# 每帧启动一次 Chrome，用 ?t=秒数 让页面定位到该时刻后截图。
# 慢（约 0.3~1s/帧），但零 Node 依赖。日常请用 run.sh → render-cdp.mjs。
#
# 用法: ./render-cli.sh [/path/to/output.mp4]
#   PAGE=index-ios.html DURATION=7.0 AUDIO=audio/loveco-ios-keyboard.m4a ./render-cli.sh
set -e
cd "$(dirname "$0")"

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
FFMPEG="${FFMPEG:-ffmpeg}"
FPS=30
DURATION="${DURATION:-6.5}"
W="${W:-640}"
H="${H:-456}"
SCALE="${SCALE:-2}"
PAGE="${PAGE:-index.html}"
AUDIO="${AUDIO:-audio/voice.m4a}"
OUT="${1:-out/loveco-tutorial-cli.mp4}"

# 中间产物一律放 /tmp，工程目录只留源码 + out/
TMPROOT="${TMPROOT:-/tmp/loveco-video}"
FRAMES="$TMPROOT/frames-cli"
PROFILE="${PROFILE:-$TMPROOT/chrome-cli}"
mkdir -p "$FRAMES" "$PROFILE" out

TOTAL=$(python3 -c "print(round($DURATION*$FPS))")
echo "[render-cli] $PAGE -> $OUT  ($TOTAL frames @ ${FPS}fps)"

for i in $(seq 0 $((TOTAL-1))); do
  T=$(python3 -c "print($i/$FPS)")
  "$CHROME" --headless --disable-gpu --hide-scrollbars --no-first-run \
    --no-default-browser-check --disable-component-update --no-pings \
    --no-sandbox --disable-dev-shm-usage \
    --user-data-dir="$PROFILE" \
    --window-size=$W,$H --force-device-scale-factor=$SCALE \
    --screenshot="$FRAMES/f_$(printf '%05d' $i).png" \
    "file://$PWD/$PAGE?t=$T" >/dev/null 2>&1
  [ $((i % 10)) -eq 0 ] && printf "\r  %d/$TOTAL" $i
done
printf "\r  %d/%d\n" $TOTAL $TOTAL

audio_args=()
[[ -f "$AUDIO" ]] && audio_args=(-i "$AUDIO" -c:a aac -b:a 160k -shortest)
$FFMPEG -y -framerate $FPS -i "$FRAMES/f_%05d.png" -frames:v $TOTAL \
  "${audio_args[@]}" \
  -c:v libx264 -preset medium -crf 17 -pix_fmt yuv420p -movflags +faststart "$OUT"
echo "[done] $OUT"
