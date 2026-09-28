/* HarmonyOS 键盘底部导航栏（平台专属组件）。
   左侧地球：切换输入法（原型里只装了 LoveCo，实际动作是全键盘 / 九宫格切换 + 提示）。
   右侧小艺：只画外观的系统助手标识 —— 纯装饰，不带 data-action、指针事件关闭，点击没有任何反应。 */
LoveCoUI.define('harmony', 'kb-navbar', () => {
  const glyph = window.LoveCoSystemGlyphs;
  return `<div class="kb-sysbar" aria-label="HarmonyOS 键盘底栏"><button class="sys-key" data-action="switch-keyboard" title="切换输入法" aria-label="切换输入法">${glyph.globe}</button><span class="sys-key xiaoyi-key" aria-hidden="true">${glyph.xiaoyi}</span></div>`;
});
