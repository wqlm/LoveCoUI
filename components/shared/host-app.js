/* 第三方 App（宿主 App）容器 —— 微信会话界面，按设计截图 1:1 复刻（深色外观）。三端共用。
   只负责装配子组件：会话头部（会话标题）+ chat-area + [键盘让位区] + chat-composer。
   键盘模式下 LoveCo 只提供底部键盘，这里的界面属于宿主 App。
   说明：头部只保留居中的会话备注名 —— 原「返回箭头（切对象弹层）」与「更多（会话菜单）」
   两个入口已按要求删除；会话是固定聊天模板（app.js 的 HOST_CHAT，见会话标题）——
   键盘侧切换聊天对象走 LoveCo 键盘菜单栏的头像按钮（聊天对象管理页），
   这里的备注名 / 头像 / 消息不变。
   键盘收起态（state.kbCollapsed）在消息区与输入栏之间补一块「键盘让位区」（.wx-kb-space）：
   它顶上原来键盘占的那段高度，消息区因此不吃这段高度、消息列停在原位（不下移），
   只有输入栏被顶到屏幕底边 —— 那块区域本来就是宿主 App 自己的，键盘撤走后露出来。 */
LoveCoUI.define('shared', 'host-app', (ctx) => {
  const { esc, state, hostChat } = ctx;

  const chatHeader = `<header class="wx-header"><div class="wx-title">${esc(hostChat.name)}</div></header>`;
  const kbSpace = state.kbCollapsed ? '<div class="wx-kb-space" aria-hidden="true"></div>' : '';

  return `${chatHeader}
${LoveCoUI.render('chat-area', ctx)}
${kbSpace}
${LoveCoUI.render('chat-composer', ctx)}`;
});
