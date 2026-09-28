/* iOS 键盘底部导航栏（平台专属组件）。
   左侧地球：切换输入法；右侧语音输入：按住说话。
   按住语音键即开始「录音」仿真（屏幕底部三分之一的蓝色毛玻璃遮罩 + 波浪条动画），松手转写写入聊天输入框、
   上滑取消（data-voice-hold 由 app.js 的 bind() 绑 pointerdown）——
   原「主 App 接力 · 语音」弹层已删除，语音交互统一为按住说话。 */
LoveCoUI.define('ios', 'kb-navbar', () => {
  const glyph = window.LoveCoSystemGlyphs;
  return `<div class="kb-sysbar" aria-label="iOS 键盘底栏"><button class="sys-key" data-action="switch-keyboard" title="切换输入法" aria-label="切换输入法">${glyph.globe}</button><button class="sys-key voice-key" data-voice-hold="dictation" title="按住说话" aria-label="按住说话">${glyph.voice}</button></div>`;
});
