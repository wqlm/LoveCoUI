# 配音方案：安卓启用键盘（index-android.html）
#
# 与 index-android.html 的 TIMELINE.script / TIMELINE.duration 一一对齐：
#   整支片子只有一句话，字幕 0.00-2.55 一直挂着，末尾 0.22s 淡出给对勾让位
#
# 文案实测（edge-tts + 掐首尾静音后）：净长 2.04s -> 0.22s 起声，2.26s 说完，
# 距字幕段末 2.55s 还有 0.29s 余量。

TEXTS=(
  "点击开启 LoveCo 键盘"
)
OFFSETS=(220)
SLOTS=(2550)
DURATION=4.0
