/* 键盘选择器 ·「选择聊天截图（最多3张）」—— 键盘区域内的整页覆盖层。三端共用。
   入口：键盘顶部菜单栏的相册图标（data-action="photo-picker"）。
   另有一个**内嵌形态**（问AI 页里的图片选择器，state.freePicker）：只出选图网格、
        盖住输入行下方的键区（不带标题栏 / 提交按钮 / 底栏），见文件末尾那个分支。
   出口：右上角 X（data-action="close-photo-picker"）、Esc，或「立即分析」（attach-photos，
        选好截图后直接加入 AI 输入并生成；同一落点还有菜单栏的「待分析截图」缩略图
        pending-shot 与键盘激活时的「模拟截屏」，三条都汇到 app.js 的 analyzePhotos()）。
   相册访问权限（左栏「设备权限 › 相册访问权限」三档）只在聊天截图模式下改变面板形态 ——
        点菜单栏相册图标先进这道检查：
        完整访问 = 正常选择器（三列网格 + 右下角「立即分析」）；
        有限访问 = 网格照常但只有授权过的那张可读，顶部多一条引导条
                  「开启照片[完全访问]，操作更快捷～」+「开启权限」；
        完全没开 = 整块换成权限引导页（居中标题「相册权限未开启，无法访问」+ 副文案 +
                  「去开启权限」，没有网格、没有「立即分析」，也不渲染平台底栏 —— 与设计图一致）。
        两颗按钮复用左栏同一条动作 photos:full（仿真「去系统设置开启完全访问」：把权限置成
        完整访问，面板就地切回正常选择器形态）。
        头像模式不查这道权限：候选是 App 内置的模拟头像 / 插画，不读相册。
   头像模式（state.photoMode='avatar'，从新增 / 编辑聊天对象面板的头像入口进入）：
        标题改「选择头像」、只列真实图片（聊天截图卡是 CSS 画的、没有位图当不了头像）——
        候选来自 ctx.avatars()：app.js 的模拟头像批次（12 张）+ 样例里带位图的插画，
        单选（再点取消 / 点别的替换，无序号只画 ✓），底部按钮改「确定」（confirm-avatar，
        把选中图居中裁成方形存进表单草稿后回到编辑面板；X / Esc 同样返回编辑面板）。
   与对象编辑面板（kb-partner-editor）的叠层关系：选择器铺满整个键盘区域，打开前先收起编辑面板
        （app.js 的 dismissKbEditor，先兜底落库），并把来源记进 state.photoBack ——
        关闭 / 确定时按来源把编辑面板弹回来（表单草稿在 modalData 里，不丢）。
        从键盘底座打开的（菜单栏相册入口）就是单纯收起；「立即分析」走进 AI 分析链路，不回编辑面板。
   形态：键盘整块拉高到手机屏幕的三分之二（.keyboard.with-picker），面板从下往上滑入并铺满
        键盘区域（样式见 theme.css 的 .kb-photo-picker 一组规则，按设计图 1:1 复刻）；
   聊天分析面板（kb-chat-analysis）/ 对象编辑面板（kb-partner-editor）复用同一块皮肤，
   因此也要按这张设计图核对。
   底部沿用平台的键盘底栏组件 kb-navbar（iOS 地球 + 语音 / 鸿蒙 地球 + 小艺装饰图标 / Android 不渲染），
   所以 Android 上面板直接铺到屏幕底部，不会留出一条空带。
   聊天截图模式的选择逻辑（最多 3 张、按选择先后编号）复用既有的 photo:* 动作，本组件只产出结构。 */
LoveCoUI.define('shared', 'kb-photo-picker', (ctx) => {
  const { esc, ib, shot, state, photos, avatars } = ctx;
  const glyph = window.LoveCoSystemGlyphs;
  const avatarMode = state.photoMode === 'avatar';
  /* 相册访问权限（三档，见 app.js 的 state.permissions.photos）：头像模式与相册无关，恒按完整访问走 */
  const perm = avatarMode ? 'full' : state.permissions.photos;
  /* 完全没开：整块换成权限引导页（标题栏保留、副标题与网格收起） */
  const denied = perm === 'denied';

  /* 头像模式列头像候选（模拟头像整批 + 样例里带位图的插画）；聊天模式列出样例 ——
     相册首张可能不是内置样例：「模拟截屏」产生的新截图插在 samples 最前（见 app.js 的 makeScreenshot）。
     有限访问时只有用户授权过的那张能读，这里用相册首张模拟（与设计图一致） */
  const items = avatarMode ? avatars() : perm === 'limited' ? photos().slice(0, 1) : photos();
  /* 右上角徽标：聊天模式 = 第几张被选中（最多 3 张，顺序与选择顺序一致）；头像模式单选只画 ✓；
     缩略图画法来自 core/kit.js 的 shot()（分析过程页用同一套） */
  const cards = items.map(s => {
    const index = state.selectedPhotos.indexOf(s.id);
    const on = index >= 0;
    return `<button type="button" class="shot-card${on ? ' selected' : ''}" data-action="photo:${esc(s.id)}" aria-pressed="${on}" aria-label="${esc(s.name)}${on ? (avatarMode ? '，已选中' : `，已选第 ${index + 1} 张`) : '，未选择'}">${shot(s)}${on ? `<span class="shot-badge">${avatarMode ? '✓' : index + 1}</span>` : ''}</button>`;
  }).join('');

  /* 有限访问的顶部引导条：文案 + 「开启权限」胶囊（整宽，紧贴在标题栏下面，字号比标题栏小一档） */
  const banner = perm === 'limited'
    ? `<div class="picker-perm"><span>开启照片[完全访问]，操作更快捷～</span><button type="button" class="picker-perm-btn" data-action="photos:full">开启权限</button></div>`
    : '';
  /* 完全没开的引导页：居中标题 + 副文案 +「去开启权限」（占满标题栏与底栏之间的整块区域） */
  const guide = `<div class="picker-guide">
      <p class="picker-guide-title">相册权限未开启，无法访问</p>
      <p class="picker-guide-sub">开启照片[完全访问]，体验快捷分析～，操作更快捷～</p>
      <button type="button" class="picker-guide-btn" data-action="photos:full">去开启权限</button>
    </div>`;

  const confirm = denied
    ? ''
    : avatarMode
      ? `<button type="button" class="picker-analyze" data-action="confirm-avatar" ${state.selectedPhotos.length ? '' : 'disabled'}>确定</button>`
      : `<button type="button" class="picker-analyze" data-action="attach-photos" ${state.selectedPhotos.length ? '' : 'disabled'}>${glyph.spark}立即分析${state.selectedPhotos.length ? `<span class="analyze-count" aria-label="已选 ${state.selectedPhotos.length} 张">${state.selectedPhotos.length}</span>` : ''}</button>`;

  /* —— 内嵌形态：问AI 页里的图片选择器（state.freePicker）——
     不铺满键盘、也不带标题栏 /「立即分析」/ 平台底栏：只把输入行**下方**的整块键区
     （键体 + 平台底栏）换成三列聊天截图网格，从底部往上滑出、盖住键区，超出后网格内滚动
     （由 app.js 的 render() 渲染在这个位置，样式见 theme.css 的 .free-picker）。
     选中态与整页选择器共用（右上角蓝色序号，读的还是 state.selectedPhotos）——
     输入框上方的缩略图行与它同步；提交由输入行右端的蓝色「发送」按钮接手（free-send →
     sendFreeChat），所以这里不放提交按钮，也没有关闭按钮（点输入框 / Esc 即收起，见 closeFreePicker）。
     相册权限两档引导照旧生效：有限访问只放出授权过的那张；完全没开换成一行引导 +「去开启权限」。 */
  if (state.freePicker && state.freeChat) {
    return `<div class="free-picker${state.pickerEnter ? ' entering' : ''}" role="group" aria-label="选择聊天截图（最多3张）">
      ${denied
        ? `<div class="free-picker-guide"><p>相册权限未开启，无法访问</p><button type="button" class="free-picker-btn" data-action="photos:full">去开启权限</button></div>`
        : `<div class="picker-grid">${cards}</div>`}
    </div>`;
  }

  return `<div class="kb-photo-picker${avatarMode ? ' avatar-mode' : ''}${denied ? ' guide-mode' : ''}${state.pickerEnter ? ' entering' : ''}" role="dialog" aria-modal="true" aria-label="${avatarMode ? '选择头像' : '选择聊天截图（最多3张）'}">
    <header class="picker-top">
      <h2>${avatarMode ? '选择头像' : '选择聊天截图（最多3张）'}</h2>
      ${denied ? '' : `<p>${avatarMode ? '选一张图片作为聊天对象头像' : '按时间从前到后排序，分析更到位'}</p>`}
      ${ib('Close', '关闭选择器', 'close-photo-picker', 'picker-close')}
    </header>
    ${banner}
    <div class="picker-body" id="picker-body">${denied ? guide : `<div class="picker-grid">${cards}</div>`}</div>
    ${confirm}
    ${denied ? '' : LoveCoUI.render('kb-navbar', ctx)}
  </div>`;
});
