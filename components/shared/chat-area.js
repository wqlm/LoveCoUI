/* 聊天界面主体 —— 可上下滚动的消息流（微信会话样式）。三端共用。
   id="chat" 被 app.js 用于渲染前记录、渲染后还原滚动位置，改名会破坏滚动保持。
   每条消息 = 可选的时间行 + 一行「头像 + 气泡」：自己的消息头像在右、绿气泡黑字；
   对方的消息头像在左、深灰气泡浅字。对方头像是固定聊天模板（app.js 的 HOST_CHAT，
   不随键盘侧切换聊天对象而变）；「我」的头像用 selfAvatar。时间行由 app.js 的消息数据
   带出来（同一时段的连续消息不带），列表底部对齐（消息少时贴着输入栏，与截图一致）。 */
LoveCoUI.define('shared', 'chat-area', (ctx) => {
  const { esc, state, avatar, hostChat, selfAvatar } = ctx;
  const peerAvatar = avatar(hostChat.name, hostChat.color, hostChat.avatar);
  const mineAvatar = selfAvatar();

  /* fresh 标记由 app.js 在消息推送时打上、播完即清：只有真正新到的消息播入场动画，
     之后选图等操作的重渲染（DOM 重建）不再重放，聊天页不会跟着弹一下 */
  const rows = state.messages.map(m => `${m.time ? `<div class="wx-time">${esc(m.time)}</div>` : ''}<div class="wx-msg ${m.mine ? 'mine' : ''}${m.fresh ? ' fresh' : ''}">${m.mine ? '' : peerAvatar}<div class="wx-bubble">${esc(m.text)}</div>${m.mine ? mineAvatar : ''}</div>`).join('');

  return `<div class="wx-chat" id="chat">${rows}</div>`;
});
