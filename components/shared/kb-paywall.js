/* 会员开通覆盖层（kb-paywall）—— 键盘形态专属的整页覆盖层。三端共用。
   键盘形态：发起 AI 生成时额度不足（左栏「模拟 › 模拟额度耗尽」打开：积分清零且非会员）
   被拦下后，就地铺满**整个键盘区域**（菜单栏 / 键区 / 底栏一并盖住；键盘高度不额外拉高，
   就是常规键盘那一块：250px，矮窗口 210px），从下往上滑入。
   2026-09-28 起主 App 的购买改走**会员购买页**（**2026-10-06 起就是「会员购买页 · 新」**
   purchase2-copy / appPurchasePlusCopyPage —— 第一个购买页 purchase 与第二个 purchase2 当日
   都已按需求整页删除）：「我的」会员横幅 /「账户」组「会员中心」行 / 主 App 额度不足 /
   键盘安卓·鸿蒙跳转（gotoAppPurchase）四处入口都落那一页，这一层不再在主 App 形态出现。
   商品仍与主 App 共用同一张表（app.js 的 PLANS）与同一个选中档位（state.kbPlan）。
   形态自上而下：右上角圆形 X → 两行居中标题「成为LoveCo会员，/ 无限次使用AI功能～」→
   三档商品卡（永久会员 ¥128 / 周会员 ¥9.9 / 季度会员 ¥98，卡内自上而下档位名 + ¥ 现价 +
   原价划线，选中的那张浅紫底 + 紫描边）→ 整宽蓝色胶囊「立即解锁」（右上角悬一枚红色小标，
   文案随档位变：永久「一次性买断」/ 周「畅享 7 天」/ 季度「畅享 90 天」）→
   **协议行收在按钮下方、首屏可见**（2026-09-29 需求把原先沉在可视区之外的协议行收回首屏）→
   **自动续订说明（同日二次需求恢复）**：iOS 的周 / 季度档在协议行下方压一段灰色小字说明，
   超出键盘首屏 —— 主体列是这一层唯一的滚动容器，往上滚一段才露出来（永久会员档与
   安卓 / 鸿蒙没有这段、整层一屏放下）→ 平台底栏（键盘形态才有：kb-navbar，Android 不渲染、
   面板直接铺到屏幕底边；
   主 App 形态不渲染，这层直接铺到主 App 底边）。
   协议行「我已阅读并同意《会员协议》、《续费协议》」——纯文字行**不带勾选框**（按要求去掉：
   购买不再前置勾选），两份协议名都是同一层里可点的文字按钮，点开键盘内协议正文页
   （kb-legal，压在这一层之上，关掉即回本层）；
   **永久会员不显示《续费协议》**（一次性买断、不涉自动续订）：那一档只留《会员协议》。
   自动续订说明照设计图 1:1 给出（iTunes 自动续订 / 提前 24 小时扣费 / 取消方式 / 试用期规则），
   文案是 iOS 场景的，故只在 iOS 的周 / 季度档渲染；永久会员（一次性买断）整段连同《续费协议》
   一起不出现。说明段压在协议行下方、超出键盘首屏，滚动后可见（2026-09-29 二次需求；
   2026-09-29 头一次需求曾把它整段删除，同日晚些按设计图恢复）—— 续订条款全文仍可点
   《续费协议》看（kb-legal 的 renewal 正文，口径与说明一致），iOS / Android / 鸿蒙的协议行照旧。
   设计图里标题上方的「3000 万+用户选择」「第 1 名」两块徽章、以及永久会员卡上的「告白季特惠」
   标签按要求**不呈现**（协议勾选框亦已按需求去掉：购买不再前置勾选）。
   交互：点卡片切换选中档位（state.kbPlan，默认永久会员）；点「立即解锁」**直接**走 purchase 动作
   （2026-09-26 起「确认模拟订单 → 权益已到账」两个中间页已删除，点击即一键到账、随后收起本层回原处），
   商品取 PLANS（永久 / 周 / 季度，见 app.js）—— 主 App 与键盘形态共用这一张表、同一份档位。
   出口：X / Esc 只关掉这一层回原处（键盘形态回键盘、主 App 形态停原页；额度仍是 0，再发起生成还会弹）。
   皮肤固定浅色（设计图即浅色场景）：顶部一层淡紫渐变向下渐隐到白，不跟随键盘的浅色 / 深色外观。
   本组件只产出结构；选中档位由 app.js 的事件委托回存 state，重渲染不丢。 */
LoveCoUI.define('shared', 'kb-paywall', (ctx) => {
  const { esc, ib, state } = ctx;
  /* 三档商品（app.js 的 PLANS 经 uiContext 传进来）：永久 / 周 / 季度，都带一条划线原价与
     一枚按钮角标（badge）；kind 一律 member（买了就置会员标识，没有积分档） */
  const plans = ctx.plans || {};
  const plan = plans[state.kbPlan] || {};
  const close = ib('Close', '关闭付费引导', 'kb-paywall-close', 'pw-close');
  /* 与选图面板同一套「从下往上弹出」：只在这一层新弹出的那次渲染播放（app.js 的 pickerEnter） */
  const enter = state.pickerEnter ? ' entering' : '';
  /* 自动续订说明（照设计图文案）—— 文案由 app.js 统一提供（RENEWAL_NOTE 经 uiContext 传来，
     主 App 会员购买页曾共用这一段、该页 2026-10-06 已按需求整页删除；
     2026-09-29 三次需求起组件不再自带一份）：
     文案是 iOS 场景的，只在 iOS 渲染；永久会员（一次性买断）整段连同《续费协议》一起不出现。 */
  const RENEWAL_NOTE = ctx.renewalNote || '';
  const renewing = state.kbPlan !== 'permanent';
  const legalLink = (key, label) => `<button type="button" class="pw-legal-link" data-action="kb-legal:${key}">${esc(label)}</button>`;
  const cards = Object.entries(plans).map(([id, p]) => `<button type="button" class="pw-plan${state.kbPlan === id ? ' active' : ''}" data-action="kb-plan:${id}" aria-pressed="${state.kbPlan === id}">
        <span class="pw-plan-name">${esc(p.name)}</span>
        <span class="pw-plan-price"><i>¥</i>${esc(p.price)}</span>
        <span class="pw-plan-origin">¥${esc(p.origin)}</span>
      </button>`).join('');
  return `<div class="kb-paywall${enter}" role="dialog" aria-modal="true" aria-label="会员开通">
    ${close}
    <div class="pw-body">
      <h2 class="pw-title"><span>成为LoveCo会员，</span><span>无限次使用AI功能～</span></h2>
      <div class="pw-plans">${cards}</div>
      <button type="button" class="pw-cta" data-action="purchase" ${state.paymentBusy ? 'disabled' : ''}>立即解锁<span class="pw-cta-tag">${esc(plan.badge || '')}</span></button>
      <p class="pw-consent">我已阅读并同意${legalLink('membership', '《会员协议》')}${renewing ? '、' + legalLink('renewal', '《续费协议》') : ''}</p>
      ${renewing && ctx.platform === 'ios' && RENEWAL_NOTE ? `<p class="pw-note">${esc(RENEWAL_NOTE)}</p>` : ''}
    </div>
    ${state.appView === 'app' ? '' : LoveCoUI.render('kb-navbar', ctx)}
  </div>`;
});
