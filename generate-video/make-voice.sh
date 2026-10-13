#!/bin/zsh
# 生成配音 -> audio/voice.m4a
#
# 引擎：
#   edge  = 微软 Edge 神经网络语音（edge-tts，音色自然，需要联网）—— 默认
#   say   = macOS 内置离线合成（机械感重，作兜底）
#
# 文案/时间轴不在本脚本里，而在 plans/*.sh（配音方案）：
#   plans/tutorial.sh      LoveCo App 教程
#   plans/ios-keyboard.sh  iOS 键盘教程
#
# 用法：
#   ./make-voice.sh                             # 默认 plans/tutorial.sh -> audio/voice.m4a
#   PLAN=plans/ios-keyboard.sh VOICE_OUT=audio/xxx.m4a ./make-voice.sh
#   VOICE=zh-CN-YunxiNeural ./make-voice.sh
#   ENGINE=say ./make-voice.sh                  # 强制离线兜底
#   EDGE_TTS=/path/to/edge-tts ./make-voice.sh
set -e
cd "$(dirname "$0")"
mkdir -p audio

PLAN="${PLAN:-plans/tutorial.sh}"              # 配音方案文件（定义 TEXTS/OFFSETS/SLOTS/DURATION）
VOICE_OUT="${VOICE_OUT:-audio/voice.m4a}"      # 输出音频

ENGINE="${ENGINE:-auto}"                       # auto | edge | say
VOICE="${VOICE:-zh-CN-XiaoxiaoNeural}"         # edge 音色
RATE="${RATE:-+0%}"                            # edge 语速，如 +0% / +20% / -10%。0% 是模型原生节奏，最自然；
                                               # 掐过首尾静音后三句分别落在 1.69/3.93/6.20s，段内还有余量
PITCH="${PITCH:-+0Hz}"                         # edge 音调
VOLUME="${VOLUME:-+0%}"                        # edge 音量
SAY_VOICE="${SAY_VOICE:-Tingting}"             # say 音色
SAY_RATE="${SAY_RATE:-205}"                    # say 语速（词/分钟）
FFMPEG="${FFMPEG:-ffmpeg}"

TEXTS=(); OFFSETS=(); SLOTS=(); DURATION=6.5   # 兜底，正常由 "$PLAN" 覆盖

# 中间产物放 /tmp，让系统自动回收
TMPDIR_VOICE="${VOICE_TMPDIR:-/tmp/loveco-video/voice}"
mkdir -p "$TMPDIR_VOICE"

# ---------- 加载配音方案 ----------
[[ -f "$PLAN" ]] || { echo "找不到配音方案 $PLAN"; exit 1; }
source "$PLAN"
[[ ${#TEXTS[@]} -gt 0 ]] || { echo "$PLAN 里没定义 TEXTS"; exit 1; }
[[ ${#OFFSETS[@]} -eq ${#TEXTS[@]} && ${#SLOTS[@]} -eq ${#TEXTS[@]} ]] \
  || { echo "$PLAN 的 TEXTS/OFFSETS/SLOTS 长度不一致"; exit 1; }
echo "方案   : $PLAN"

# ---------- 选引擎 ----------
find_edge() {
  [[ -n "$EDGE_TTS" && -x "$EDGE_TTS" ]] && { print -r -- "$EDGE_TTS"; return }
  local c
  c="$(command -v edge-tts 2>/dev/null || true)"
  [[ -n "$c" ]] && { print -r -- "$c"; return }
  local p
  for p in /Users/wqlm/.workbuddy/binaries/python/envs/default/bin/edge-tts \
           "$HOME"/.workbuddy/binaries/python/envs/*/bin/edge-tts; do
    [[ -x "$p" ]] && { print -r -- "$p"; return }
  done
}
if [[ "$ENGINE" == "auto" ]]; then
  if [[ -n "$(find_edge)" ]]; then ENGINE=edge; else ENGINE=say; fi
fi
[[ "$ENGINE" == "edge" ]] && EDGE_TTS="$(find_edge)"
if [[ "$ENGINE" == "edge" && -z "$EDGE_TTS" ]]; then
  echo "!! 找不到 edge-tts，回落 say 引擎"
  ENGINE=say
fi

# ---------- 逐句合成 ----------
n=${#TEXTS[@]}
inputs=(); filters=(); mixin=""; ext=""
for i in $(seq 1 $n); do
  txt="${TEXTS[$i]}"
  if [[ "$ENGINE" == "edge" ]]; then
    ext=mp3
    "$EDGE_TTS" --voice "$VOICE" --rate="$RATE" --pitch="$PITCH" --volume="$VOLUME" \
      --text "$txt" --write-media "$TMPDIR_VOICE/_line$i.mp3" >/dev/null
  else
    ext=aiff
    say -v "$SAY_VOICE" -r "$SAY_RATE" -o "$TMPDIR_VOICE/_line$i.aiff" "$txt"
  fi
  f="$TMPDIR_VOICE/_line$i.$ext"
  # 掐掉首尾静音，让起声点等于 OFFSETS，节奏不会被随机留白带偏
  $FFMPEG -y -i "$f" -af \
    "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,areverse" \
    "$TMPDIR_VOICE/_t$i.$ext" -loglevel error
  inputs+=(-i "$TMPDIR_VOICE/_t$i.$ext")
  filters+=("[$((i-1)):a]adelay=${OFFSETS[$i]}|${OFFSETS[$i]},aformat=fltp:44100:stereo[l$i]")
  mixin+="[l$i]"
done

# ---------- 报时长 / 校验是否溢出字幕段 ----------
echo "引擎=$ENGINE 音色=$([[ $ENGINE == edge ]] && print -r -- "$VOICE @ $RATE" || print -r -- "$SAY_VOICE @ $SAY_RATE")"
warn=0
for i in $(seq 1 $n); do
  ms=$(( $(afinfo "$TMPDIR_VOICE/_t$i.$ext" | awk -F': ' '/estimated duration/{printf "%d", $2*1000}') + OFFSETS[$i] ))
  if (( ms > SLOTS[$i] )); then
    echo "  L$i 到 ${ms}ms  > 段末 ${SLOTS[$i]}ms  溢出了，调小 RATE 或改字幕段"
    warn=1
  else
    echo "  L$i 到 ${ms}ms  (段末 ${SLOTS[$i]}ms)  OK"
  fi
done
(( warn )) && echo "!! 有句子超出字幕段，画面和配音会对不上"

# ---------- 拼接 ----------
$FFMPEG -y "${inputs[@]}" \
  -filter_complex "${(j:;:)filters};${mixin}amix=inputs=$n:normalize=0,apad=whole_dur=${DURATION},loudnorm=I=-16:TP=-1.5:LRA=11" \
  -c:a aac -b:a 160k -ar 44100 -ac 2 "$VOICE_OUT" -loglevel error

echo "-> $VOICE_OUT"
