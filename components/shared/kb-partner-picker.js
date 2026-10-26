/* 问AI 页里的「选择聊天对象」列表 —— 输入行左端那颗圆形头像按钮弹出的内嵌覆盖层。三端共用。
   入口：问AI 页（键盘形态 kb-free-chat）输入行左端的头像按钮（data-action="free-partner-picker"，
       主 App「AI 咨询师」页走的是它自己的底部弹窗 aiSheetHtml，不进这里）。
   形态：与同页的图片选择器（kb-photo-picker 的内嵌形态 .free-picker）同一套摆法 ——
       输入行**下方**的整块键区（键体 + 平台底栏）换成对象列表，从底部往上滑出、盖住键区
       （样式见 theme.css 的 .free-partner-list），超出后列表内滚动；**不铺满整个键盘**、
       也不拉高键盘（键区高度不变，输入行与标题栏照旧在列表上方）。
       容器类名刻意避开 .free-partner —— 那是输入行左端那颗头像按钮（theme.css 里已有
       .free-partner / .free-partner .avatar 两条规则），容器不能与它同名。
   行：首行「不选择」（头像同样是默认头像，与聊天对象管理页 / 主 App 对象弹窗同一张 ——
      2026-10-26 需求起是灰色人形图标）
       + 其余对象按当前顺序 —— 一行 = 圆形头像 + 备注名 + 关系阶段小字，当前选择整行浅底。
       **只能选择**：这里没有左滑手势、也不挂编辑 / 删除按钮（那是聊天对象管理页
       partner-manager 的形态；本列表只是切换对象的一个快捷层），行样式与主 App
       「AI 咨询师」页的对象弹窗共用一套（theme.css 的 .aai-prow / .free-prow 同组规则）。
   出口：点任意一行选中（select-partner:<id>，选完即收、留在问AI 页，输入行头像随之更新）、
       点提问输入框（回键盘页）、Esc、再点一次头像按钮（同一枚按钮的开 / 关）。
   本组件只产出结构，开关与选择逻辑都在 app.js（state.freePartnerPicker / select-partner）。 */
LoveCoUI.define('shared', 'kb-partner-picker', (ctx) => {
  const { esc, state, person, partnerAvatar, noneAvatar, defaultAvatar } = ctx;
  const current = person();
  /* 首行「不选择」：没有选中对象时也是高亮态（与列表里的选中行同一套 .on 表达） */
  const row = (p) => {
    const on = p ? state.selectedPartner === p.id : !current;
    return `<button type="button" class="free-prow${on ? ' on' : ''}" data-action="select-partner:${p ? esc(p.id) : 'none'}" aria-pressed="${on}">${p ? partnerAvatar(p) : noneAvatar(defaultAvatar)}<span class="free-pname">${p ? esc(p.name) : '不选择'}</span>${p ? `<small>${esc(p.stage)}</small>` : ''}</button>`;
  };
  return `<div class="free-partner-list${state.pickerEnter ? ' entering' : ''}" role="dialog" aria-label="选择聊天对象">
    ${row(null)}${state.partners.map(row).join('')}
  </div>`;
});
