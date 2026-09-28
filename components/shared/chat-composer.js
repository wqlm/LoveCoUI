/* 聊天界面输入栏 —— 宿主 App 的待发送输入区（微信样式）。三端共用。
   id="host" 被 app.js 绑定输入 / 焦点 / 回车发送，改名会破坏宿主输入链路。
   显示值走 ctx.displayText('host')：已确认文本 + 未确认的组合串（拼音字母直接落在
   光标处，点候选词 / 空格 / 回车后由候选词替换，见 app.js 的 commitComposition）。
   输入框外面套一层 .input-wrap，里面压着 .compose-mirror：给未确认的那段字母画下划线
   （textarea 自己被整块文本占满，没法只给一段字加线），由 app.js 的 paintComposeMirror 填内容。
   两个语音入口（左侧圆钮、框内麦克风）都是「按住说话」（data-voice-hold，app.js 绑 pointerdown：
   按住浮出屏幕底部三分之一的蓝色毛玻璃遮罩（上缘渐隐），松手转写写入输入框 / 上滑取消）—— 与微信的按住说话一致；
   输入框有内容时右侧表情圆钮换成「发送」（原「更多」圆钮无动作，已删除）。 */
   LoveCoUI.define('shared', 'chat-composer', (ctx) => {
   const { esc, displayText } = ctx;
   const glyph = window.LoveCoSystemGlyphs;
   const typed = displayText('host').trim().length > 0;

   const tail = typed
     ? '<button class="wx-send" data-action="send-host">发送</button>'
     : `<button class="wx-circle" data-action="emoji-host" title="表情" aria-label="表情">${glyph.wxEmoji}</button>`;

  return `<div class="wx-composer"><button class="wx-circle" data-voice-hold="composer" title="按住说话" aria-label="按住说话">${glyph.wxVoice}</button><div class="input-wrap wx-field"><div class="compose-mirror" data-mirror="host" aria-hidden="true"></div><textarea id="host" aria-label="聊天输入框" maxlength="1200">${esc(displayText('host'))}</textarea><button class="wx-field-mic" data-voice-hold="composer" title="按住说话" aria-label="按住说话">${glyph.wxMic}</button></div>${tail}</div>`;
});
