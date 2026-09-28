/* 候选词栏 —— 键盘顶部菜单栏在打字形态下的第二种形态，打字时顶替菜单栏的位置。三端共用。
   候选词 / 联想词只属于中文键盘（26 键拼音与九宫格）：英文键盘不进打字态，不会出现这一栏。
   结构：candidates（候选词）+ 最右侧的返回按钮。
   未确认的拼音字母不在这一栏里 —— 它们直接落在输入框里，并由输入框自己用下划线标出
   「还没确认」（见 app.js 的 paintComposeMirror），所以这一栏不再提示落点；
   点候选词 / 空格 / 回车后由输入框里的字母替换成候选词（commitComposition）。
   两个出口都回到第一状态（菜单栏）：最右侧的 X，或把输入全部删光（见 app.js 的 keypress）。
   候选词由 core/ime.js 计算，本组件只负责展示。 */
LoveCoUI.define('shared', 'kb-candidates', (ctx) => {
  const { esc, ib, state } = ctx;
  const ime = window.LoveCoIME;

  /* 九宫格打字时组合串是数字：候选词按当前选中的拼音字母组合算（见 core/ime.js 的 activePath）；
     组合串为空（联想态）时把光标前的文字作为上下文传进去，联想词跟着已输入的内容变 ——
     上下文取**当前输入目标**（宿主输入框 / 问AI 页的提问框 / 编辑面板的备注名，
     见 app.js 的 targetContext），所以问AI 页打字时联想词跟的是那句提问，不是宿主草稿 */
  const active = ime.activePath(state.composition, state.t9Path);
  const context = ctx.targetContext();
  const candidates = ime.candidates(active, context).map((c,i)=>`<button data-action="candidate:${i}">${esc(c)}</button>`).join('');
  return `<div class="kb-toolbar candidate-bar" aria-label="候选词栏"><div class="candidates">${candidates}</div>${ib('Close','返回菜单栏','exit-typing','candidate-exit')}</div>`;
});
