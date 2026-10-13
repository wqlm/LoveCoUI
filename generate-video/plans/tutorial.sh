# 配音方案：LoveCo App 教程（index.html）
#
# 被 make-voice.sh 用 `source` 加载。改文案 = 改这里 + index.html 的 TIMELINE.script。
#   OFFSETS[i]  第 i 句的起始时间(ms)
#   SLOTS[i]    第 i 句必须在此刻之前说完(ms)，与 TIMELINE.script 的段末对齐
#   DURATION    总时长(秒)，与 TIMELINE.duration 一致

TEXTS=(
  "先开启 LoveCo 键盘"
  "再打开完整体验模式"
  "完成后返回 LoveCo App"
)
OFFSETS=(60 2060 4300)
SLOTS=(2000 4250 6500)
DURATION=6.5
