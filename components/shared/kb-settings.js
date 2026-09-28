/* 键盘设置页 · 选择你喜欢的中文键盘 —— 键盘区域内的整页覆盖层。三端共用。
   结构：右上角圆形收起按钮（V 形箭头，ArrowDown）+ 居中标题「选择你喜欢的中文键盘」，
   下面是一张圆角卡片，卡片里并排两个选项：九宫格拼音 / 全键盘拼音（图形 + 文字，
   选中项整体取强调色）。
   入口：键盘顶部菜单栏最右侧的设置图标（data-action="kb-settings"）。
   出口：圆形返回按钮（data-action="close-kb-settings"）或 Esc（见 app.js）；
   选完布局也直接收起（layout:* 动作）—— 收起后回键盘页。
   对象编辑面板（kb-partner-editor）打开时：本覆盖层只覆盖**下半键盘区域**、面板留在上半，
   两者上下分区共存（见 theme.css 的 .keyboard:has(.kb-partner-editor) .kb-settings）——
   在新增 / 修改页面里切键盘形态时上方区域不消失，收起 / 选完布局后仍在编辑页面。
   选中项直接写 state.layout：qwerty = 全键盘（26 键），t9 = 九宫格，
   键区形态由 kb-keys 按 state.layout 输出，切换后立即变化。
   数字 / 符号 / 英文 / 九宫格中文 / 26 键中文是五套独立键盘，只有中文有两套布局：
   英文键盘下选布局会直接切到所选的中文键盘（见 app.js 的 layout:* 动作）。
   两个布局图形来自 system-glyphs.js（icons.js 是生成物，不放这两个图形）。 */
LoveCoUI.define('shared', 'kb-settings', (ctx) => {
  const { icon, state } = ctx;
  const glyphs = window.LoveCoSystemGlyphs;

  const options = [['t9', '九宫格拼音', glyphs.t9], ['qwerty', '全键盘拼音', glyphs.qwerty]].map(([id, label, glyph]) => {
    const active = state.layout === id;
    return `<button class="layout-choice${active ? ' active' : ''}" data-action="layout:${id}" aria-pressed="${active}"><span class="layout-choice-icon" aria-hidden="true">${glyph}</span><strong>${label}</strong></button>`;
  }).join('');

  return `<div class="kb-settings${state.panelEnter ? ' entering' : ''}" role="dialog" aria-modal="true" aria-label="选择你喜欢的中文键盘">
    <header class="settings-top">
      <button class="settings-back" data-action="close-kb-settings" title="返回键盘" aria-label="返回键盘">${icon('ArrowDown')}</button>
      <h2>选择你喜欢的中文键盘</h2>
    </header>
    <div class="settings-body"><div class="layout-cards">${options}</div></div>
  </div>`;
});
