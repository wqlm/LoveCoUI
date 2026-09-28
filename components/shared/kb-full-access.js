/* 键盘完全访问引导页 —— 键盘区域内的整页覆盖层（键盘形态）/ 铺满正文区的一层（主 App 形态）。三端共用。
   触发（键盘形态）：键盘被唤起时的**第一道检查**（app.js 的 checkKbEntry：先看完全访问权限、再看登录状态）——
   键盘侧没有「完全访问」权限时，从下往上弹出、盖住菜单栏 / 键区 / 底栏（键盘高度不额外变化，
   就是常规键盘那一块）；权限开了才轮到登录检查（见 kb-login）。权限名按平台取叫法：
   iOS「允许完全访问」（系统设置里的开关名）、鸿蒙「完整访问」；Android 系统上该权限默认开启，
   因此这一层不会出现（app.js 的 needsFullAccess）。
   触发（主 App 形态，2026-09-28 起）：主 App 的状态检查链（appEntryGuards：键盘权限 → 完全访问 →
   登录状态）走到第二环且权限未开时弹出 —— 渲染在 .app-shell 里、铺满整个正文区（含底部 Tab 栏），
   不渲染键盘底栏（kb-navbar），元素尺度按主 App 放大一档（theme.css 的 .app-phone .kb-full-access）。
   出口（两种形态相同）：「去开启」= 仿真「去系统设置开启完全访问」后接着做登录检查
   （data-action="kb-full-access-open"）；右上角叉号 = 关掉这一层、回到原页面 / 键盘页
   （data-action="kb-full-access-close"，权限仍未开 —— 键盘收起后下次唤起、或再次进入主 App 时会再弹一次）。
   形态：面板自上而下 —— 浅色顶条（**只有右上角一个叉号**，没有文字，底色与主体一致）→
   标题「开启[允许完全访问]，AI 帮你回复」（在引导图上方、居中）→ 白色卡片里的两张引导图 →
   蓝色「去开启」按钮 → 键盘形态再往下接平台底栏（kb-navbar，主 App 形态不渲染）。
   样式见 theme.css 的 .kb-full-access 一组规则。
   引导动画：两张设置操作引导图在卡片里交叉淡入淡出、无限轮播（纯 CSS 动画，约 3 秒一张，不用 JS 定时器）：
     ① 系统设置的键盘入口 —— 设置列表（Siri / 搜索 / 通知 / 无线数据 / 键盘），红色箭头指「键盘」这一行；
     ② 键盘详情页的权限开关 —— 「LoveCo 键盘」开着、权限开关关着，红箭头指这颗开关。
   设计图里的两张图是系统设置截图，这里按截图结构用 CSS 画（不引位图，窄机上也清晰）。
   Esc 与右上角叉号同一条出口。 */
LoveCoUI.define('shared', 'kb-full-access', (ctx) => {
  const { esc, icon, ib, state } = ctx;
  const glyph = window.LoveCoSystemGlyphs;
  /* 权限名按平台取系统里的叫法（Android 不会走到这一层，兜底也留一份文案）；
     设置列表里那一行的名字：iOS 是「键盘」，鸿蒙的设置里是「输入法」 */
  const permLabel = { ios: '允许完全访问', harmony: '完整访问', android: '完全访问' }[ctx.platform] || '允许完全访问';
  const rowLabel = ctx.platform === 'harmony' ? '输入法' : '键盘';
  /* 右上角的叉号：关掉这一层、回到键盘页（键盘继续可用，只是权限还没开）；顶条里唯一的元素，不配任何文字 */
  const close = ib('Close', '关闭引导页', 'kb-full-access-close', 'kfa-close');
  /* 设置列表（第一张引导图）：icon 列只画纯色圆角方块（截图里的系统图标缩到这么小只是一块色标） */
  const rows = [
    ['siri', 'Siri'],
    ['search', '搜索'],
    ['notif', '通知'],
    ['cell', '无线数据'],
    ['kb', rowLabel],
  ].map(([kind, name], i) => `<div class="kfa-row${i === 4 ? ' hl' : ''}"><i class="kfa-ico i-${kind}"></i><span>${esc(name)}</span><i class="kfa-chev"></i></div>`).join('');

  return `<div class="kb-full-access${state.pickerEnter ? ' entering' : ''}" role="dialog" aria-modal="true" aria-label="开启${esc(permLabel)}">
    <header class="kfa-head">${close}</header>
    <div class="kfa-body">
      <h2 class="kfa-title">开启[${esc(permLabel)}]，AI 帮你回复</h2>
      <div class="kfa-stage" role="img" aria-label="开启步骤示意图：在系统设置里找到键盘，打开${esc(permLabel)}">
        <div class="kfa-slide step-1">
          <div class="kfa-shot">
            <div class="kfa-screen">${rows}</div>
            <span class="kfa-arrow a1" aria-hidden="true">${glyph.guide}</span>
          </div>
        </div>
        <div class="kfa-slide step-2" aria-hidden="true">
          <div class="kfa-shot">
            <div class="kfa-screen">
              <div class="kfa-nav"><i class="kfa-back"></i><span>LoveCo 键盘</span></div>
              <div class="kfa-card">
                <div class="kfa-row"><span>LoveCo 键盘</span><i class="kfa-toggle on"></i></div>
                <div class="kfa-row"><span>${esc(permLabel)}</span><i class="kfa-toggle"></i></div>
              </div>
              <p class="kfa-note">开启后键盘才能使用网络与云端能力，把话接得更好。</p>
            </div>
            <span class="kfa-arrow a2" aria-hidden="true">${glyph.guide}</span>
          </div>
        </div>
      </div>
      <button type="button" class="kfa-primary" data-action="kb-full-access-open">去开启</button>
    </div>
    ${state.appView === 'keyboard' ? LoveCoUI.render('kb-navbar', ctx) : ''}
  </div>`;
});
