/* 聊天对象管理页 —— 键盘模式下的整块页面。三端共用。
   覆盖范围：整个键盘区域（顶部菜单栏 / 候选词栏 + 按键区 + 底部导航栏），
   但**不覆盖宿主 App 的聊天输入栏** —— 输入栏属于宿主 App，不是 LoveCo 键盘的一部分。
   入口：键盘顶部菜单栏左侧的账户 / 头像按钮（data-action="partner-manager"）。
   出口：右上角 X（data-action="close-partner-manager"）、Esc，或单击任意行选中后由 app.js 立即退出。
   行结构：编辑 / 删除停在行右侧外侧（.row-actions），左滑时滑入盖在行内容（.row-slide）上 ——
   行内容固定不动，滑开时头像与名称仍可见（键盘面板窄，内容整行左移会被按钮组推出可视区）；
   滑动手势与防误触在 app.js 的 bind()，样式在 theme.css 的 .swipe-row。
   行内文字：头像后只显示备注名 + 关系阶段（性别 / 备注不再展示，与键盘编辑面板字段一致）。
   选中与否只靠行边框高亮表达，不再画 ✅；行内的选择 / 新建 / 编辑 / 删除
   全部复用 app.js 已有的聊天对象动作，本组件只产出结构。 */
LoveCoUI.define('shared', 'partner-manager', (ctx) => {
  const { esc, icon, ib, noneAvatar, state, person, partnerAvatar } = ctx;
  const current = person();

  /* 列表直接读 state.partners —— 删除是真删除（app.js deletePartner 落库后数据即少一条），
     这里没有隐藏层；partnersEmptyDemo 只给页面列表的「空列表」形态用：置位时按空态渲染、
     不动对象数据（真实把对象删光时列表自然为空，是同一块空态） */
  const rows = (state.partnersEmptyDemo ? [] : state.partners).map(p => {
    /* 正在播删除收起动画的行（app.js deletePartner 实测行高）：挂 .removing + --row-h（见 theme.css） */
    const h = state.partnersRemoving.get(p.id);
    return `<div class="partner-row swipe-row ${state.selectedPartner===p.id?'selected':''}${h!=null?' removing':''}"${h!=null?` style="--row-h:${h}px"`:''}>
      <div class="row-actions">
        <button type="button" class="row-action edit" data-action="edit-partner:${esc(p.id)}" aria-label="编辑 ${esc(p.name)}">${icon('EditPen')}</button>
        <button type="button" class="row-action del" data-action="remove-partner:${esc(p.id)}" aria-label="删除 ${esc(p.name)}">${icon('Delete')}</button>
      </div>
      <div class="row-slide">
        <button class="partner-pick" data-action="select-partner:${esc(p.id)}" aria-pressed="${state.selectedPartner===p.id}" aria-label="选择 ${esc(p.name)}">${partnerAvatar(p)}<span class="person-meta"><strong>${esc(p.name)}</strong><small>${esc(p.stage)}</small></span></button>
      </div>
    </div>`;}).join('');

  return `<div class="partner-manager${state.panelEnter ? ' entering' : ''}" role="dialog" aria-modal="true" aria-label="聊天对象管理">
    <header class="panel-top">
      <div class="panel-heading"><strong>聊天对象</strong></div>
      <button class="panel-new" data-action="new-partner">${icon('Plus')}新建</button>
      ${ib('Close','返回键盘','close-partner-manager')}
    </header>
    <div class="panel-list">
      <button class="partner-row none-row ${current?'':'selected'}" data-action="select-partner:none" aria-pressed="${!current}">${noneAvatar()}<span class="person-meta"><strong>不选择</strong></span></button>
      ${rows || '<p class="panel-empty">还没有聊天对象，点右上角「新建」添加。</p>'}
    </div>
  </div>`;
});
