/* 键盘顶部菜单栏。三端共用。
   键盘菜单：左侧是当前聊天对象（头像 + 昵称，未选对象时为默认头像插画 +「未选择」），
   最右侧三个入口 —— 问AI（气泡，进入与 AI 对话的页面，见 kb-free-chat.js）、
   相册（图片与最近截图）、键盘设置。
   打字时切换到「候选词栏」，是同一位置的另一种形态，独立成组件见 kb-candidates.js。
   深度思考开关已移除；键盘常驻后不再需要「打开输入键盘」按钮，点按键即进入候选词栏状态。 */
LoveCoUI.define('shared', 'kb-toolbar', (ctx) => {
  const { esc, icon, ib, person, personName, partnerAvatar, noneAvatar, defaultAvatar } = ctx;
  const name = person() ? personName() : '';

  /* 左侧的聊天对象入口：已选对象时显示对方头像（与聊天页同一张插画），未选择时也用
     默认头像插画 akalin（2026-10-06 需求，ctx.defaultAvatar = AV.chat，经 noneAvatar 出图，
     .avatar.none-img 无虚线空槽；主 App 聊天对象头像与使用引导聊天样式的头像不在此路径，不受影响）。
     入口仍是聊天对象管理页（partner-manager）。 */
  const user = `<button type="button" class="kb-user" data-action="partner-manager" title="聊天对象管理" aria-label="聊天对象管理：${esc(name || '未选择')}">${person() ? partnerAvatar() : noneAvatar(defaultAvatar)}<span class="kb-user-name${name ? '' : ' empty'}">${esc(name || '未选择')}</span></button>`;
  /* 右侧两个常驻入口：相册（键盘选择器「选择聊天截图」：面板从下往上弹出、覆盖键盘区域）
     与键盘设置（整页覆盖层）。
     **待分析截图**（键盘不在屏时「模拟截屏」产生、被唤起后三关都过的那张）：相册图标就地换成
     它的缩略图 —— 一张**方形真位图**（core/kit.js 的 shotThumb 用 canvas 画好、导出 data URL，
     app.js 的 shotThumbImage 缓存同一张只画一次）：不再用 DOM 拼 3:4 卡片，那套卡片缩到这枚
     图标大小后气泡文字会溢出卡片。整枚图标持续放大缩小引导点击；点它不再走选图，
     直接进「AI 分析」过渡页（data-action="pending-shot"）。
     取用条件在 app.js 的 pendingShotItem()（未见对象时为 null，退回普通相册图标）。 */
  const pending = ctx.pendingShot ? ctx.pendingShot() : null;
  const album = pending
    ? `<button type="button" class="icon-btn kb-shot-thumb" title="分析刚刚的截图" aria-label="分析刚刚的截图" data-action="pending-shot"><img src="${ctx.shotThumb(pending)}" alt=""></button>`
    : ib('Picture', '选择聊天截图', 'photo-picker');
  /* 相册左侧的气泡按钮 = 问AI 页（AI 对话）入口：键盘顶部换成「问AI」标题栏 + 输入区，
     键区照常在下（见 kb-free-chat.js / app.js 的 openFreeChat）。 */
  const end = (extra = '') => `<div class="kb-toolbar-end">${ib('ChatDotRound', '问AI', 'free-chat')}${album}${ib('Setting', '键盘设置', 'kb-settings')}${extra}</div>`;

  return `<div class="kb-toolbar">${user}${end()}</div>`;
});
