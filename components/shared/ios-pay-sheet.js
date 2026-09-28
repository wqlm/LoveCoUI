/* iOS 系统支付框（ios-pay-sheet 组件）—— iOS 上点会员开通层的「立即解锁」就地弹出的
   **系统级**弹窗（App Store 内购确认，照参考截图 1:1）。三端共用（只有 iOS 会走到它）。
   它不属于键盘、也不属于 LoveCo —— 挂在手机根节点上、铺满整个手机屏幕（含键盘与宿主 App），
   演的是系统自己的购买确认界面：
   自上而下：屏幕右上角两行白色提示「Double Click / to Pay」（压在蒙层之上）→
   底部一块**深色 sheet**（固定系统深色外观，不跟随键盘的浅色 / 深色皮肤）：
   ① 大标题「App Store」+ 右上角圆形 X；② 商品卡（LoveCo 图标 + 档位名 + App 名与「12+」评级 +
   「In-App Purchase」+ 价格与计费说明）；③ 卡外一行「Account: …」（仿真 Apple 账户）；
   ④ 底部居中的侧边按钮图形 + 「Confirm with Side Button」。
   档位名与计费说明随 state.kbPlan 变：永久档为一次性买断（Lifetime / One-time charge，即截图
   那一档），周 / 季度是自动续订（Weekly / Quarterly，写「Auto-renewable · …」）；价格取
   ctx.plans（与 kb-paywall 同一张表 PLANS），统一格式化成两位小数。
   交互：点 X（ios-pay-close）= 取消购买、只收起这层回会员开通层；点确认区（ios-pay-confirm）
   = 确认支付（真机是双击侧边按钮），走完仿真支付、权益到账并连同会员开通层一起收起
   （见 app.js 的 completePurchase）；点蒙层不关闭（与系统弹窗一致）。
   试付进行中（state.paymentBusy）时两个出口都不可点。
   弹入动画由 app.js 的 pickerEnter 控制（只在打开那一次渲染播放，与其它覆盖层同一套机制）。 */
LoveCoUI.define('shared', 'ios-pay-sheet', (ctx) => {
  const { esc, ib, state } = ctx;
  const plans = ctx.plans || {};
  const plan = plans[state.kbPlan] || {};
  /* 档位在系统弹窗里的商品名与计费说明（照截图那一档的写法；取不到档位就回落到表里的中文名） */
  const MARKETING = {
    permanent: ['Lifetime', 'One-time charge'],
    week: ['Weekly', 'Auto-renewable · 7 days'],
    quarter: ['Quarterly', 'Auto-renewable · 90 days'],
  };
  const [name, charge] = MARKETING[state.kbPlan] || [plan.name || '', ''];
  const price = plan.price == null ? '' : `¥${Number(plan.price).toFixed(2)}`;
  const busy = state.paymentBusy ? ' disabled' : '';
  const enter = state.pickerEnter ? ' entering' : '';
  /* 侧边按钮指示图形（蓝圆底 + 手机轮廓 + 右侧边按钮 + 指向它的箭头）—— 纯装饰，
     点击落在整颗确认按钮上（文字「Confirm with Side Button」即它的读屏标签） */
  const SIDE_BUTTON = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <circle cx="24" cy="24" r="22.4" fill="#0A84FF" fill-opacity=".22" stroke="#0A84FF" stroke-width="1.4"/>
      <rect x="14.6" y="14.5" width="15" height="21" rx="4" stroke="#FFFFFF" stroke-width="1.8"/>
      <rect x="31" y="18.5" width="2.6" height="8" rx="1.3" fill="#FFFFFF"/>
      <path d="M41 19.5l-4.6-3.4M41 19.5l-4.6 3.4" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  return `<div class="aps-layer${enter}" role="dialog" aria-modal="true" aria-label="App Store 购买确认">
    <div class="aps-scrim" aria-hidden="true"></div>
    <p class="aps-hint" aria-hidden="true">Double Click<br>to Pay</p>
    <div class="aps-sheet">
      <div class="aps-head"><h2 class="aps-title">App Store</h2>${ib('Close', '取消购买', 'ios-pay-close', 'aps-close')}</div>
      <div class="aps-card">
        <div class="aps-item">
          <img class="aps-icon" src="assets/brand/LoveCo_108_108.png" alt="">
          <div class="aps-info">
            <strong class="aps-name">${esc(name)}</strong>
            <p class="aps-sub"><span>LoveCo 键盘-恋爱聊天键盘&amp;AI智能聊天回复神器</span><i class="aps-rating">12+</i></p>
            <p class="aps-sub">In-App Purchase</p>
          </div>
        </div>
        <p class="aps-price">${esc(price)}</p>
        <p class="aps-charge">${esc(charge)}</p>
      </div>
      <p class="aps-account">Account: 649924325@qq.com</p>
      <button type="button" class="aps-confirm" data-action="ios-pay-confirm"${busy}>
        <span class="aps-side" aria-hidden="true">${SIDE_BUTTON}</span>
        <span class="aps-confirm-text">Confirm with Side Button</span>
      </button>
    </div>
  </div>`;
});
