/* 键盘内协议正文页 —— 键盘区域内的整页覆盖层，压在登录层之上（层级最高）。三端共用。
   入口：键盘内登录层协议勾选行里的三处协议名（kb-login.js 的 legalLink，动作 kb-legal:<key>）——
   正文与主 App「协议中心 → 协议正文」**同一份快照**（legal-data.js），只是**缩到键盘这一条
   高度里**滚动浏览：顶条（键盘菜单栏那么高，左边一行小字协议名、右边 X）→ 正文区
   （flex:1 + 纵向滚动，在键盘高度内翻完全文）。
   形态由 state.kbLegal 决定（'' = 不显示 / 'terms' 用户协议 / 'privacy' 隐私协议 /
   'carrier' 中国联通认证服务协议），正文与标题经 uiContext 的 kbLegal（app.js 的 kbLegalDoc）
   取用；皮肤与登录层同一套 --kbl-* 令牌（固定浅色，不跟随键盘外观）。
   出口：右上角 X（close-kb-legal）或 Esc —— **只关掉本页**，底下的登录层原样还在
   （协议勾选状态不动）；关闭登录层 / 收起键盘（kbReset）时随登录层一并收起。 */
LoveCoUI.define('shared', 'kb-legal', (ctx) => {
  const { esc, ib, state } = ctx;
  const doc = ctx.kbLegal ? ctx.kbLegal() : null;
  if (!doc) return '';
  /* 与登录层同一套「从下往上弹出」：只在协议页新弹出的那一次渲染播放（kbLegalEnter 是这一层的
     一次性标记 —— 不复用 pickerEnter，免得连带把底下的登录层一起重播一遍滑入动画） */
  const enter = state.kbLegalEnter ? ' entering' : '';
  return `<div class="kb-legal${enter}" role="dialog" aria-modal="true" aria-label="${esc(doc.title)}">
  <div class="kbl-bar"><h2 class="kbl-bar-title">${esc(doc.title)}</h2>${ib('Close', '关闭协议正文', 'close-kb-legal', 'kbl-close')}</div>
  <div class="kbl-legal-body"><div class="kbl-legal-text">${esc(doc.body)}</div></div>
</div>`;
});
