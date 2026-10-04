/* 登录层（kb-login）—— 主 App 与键盘共用同一套组件、同一份表单状态（state.kbLogin）。三端共用。
   键盘形态（覆盖层）触发：键盘被唤起时检查登录状态（app.js 的 checkKbLogin）—— 点宿主输入框把收起的
   键盘唤回、启动即常驻、左栏关掉「登录状态」开关这三个时机都检查；未登录即从下往上弹出，
   覆盖整个键盘 UI 区域（菜单栏 / 键区 / 底栏），**高度与键盘保持一致**（常规 250px，不额外拉高键盘）。
   主 App 形态（独立页面，2026-09-29 按需求不再是覆盖层；同日前身是「登录覆盖层」、
   2026-09-26 前是「登录 LoveCo」整页；同日晚些拆成两页 —— appScreen='login'「手机号登录」
   固定短信表单、appScreen='login-one-tap'「一键登录」固定一键形态，页面即键盘内一键登录弹窗那套）：
   未登录启动 / 切到主 App、未登录点底部 Tab、需要登录的
   操作被拦下（checkKbLogin / needLogin → openAppLogin）都进这两页之一（按蜂窝网络开关落页）——
   同一套结构整页直出（无底部 Tab），X / Esc 关掉、登录成功收尾都回来路页（appLoginReturn）；
   三种形态由 state.kbLogin 决定：
     one-tap 本机号一键登录 —— 蜂窝网络可用（左栏「设备权限 › 蜂窝网络」打开 = 视为已插卡且有蜂窝网络）
              时的默认形态：顶部一行键盘菜单栏那么高的**顶条**（--lc-toolbar-height，常规 40px / 矮窗口 27px），
              X 靠右独占这一行 —— 本机号与它下面的内容整体跟着下移这一行的高度；
              顶条下是居中的大号本机号（state.phone），下面是整宽蓝色胶囊主按钮；主按钮下是
              「手机号登录」入口（切到短信形态），底部一行协议勾选 —— **未勾选时点主按钮不会静默无反应**：
              键盘形态让协议行抖一下（app.js 的 shakeKbConsent），主 App 的登录页弹
              「请阅读并同意以下条款」弹框（.kbl-ask，见下）；
     sms     手机号登录 —— 蜂窝网络不可用（无卡 / 未开蜂窝网络）时的默认形态，或从一键登录页点
              「手机号登录」切过来（就地换表单，不重放滑入动画）：顶部一行小字页名「手机号登录」，
              下面手机号 + 验证码两张浅灰胶囊输入框（验证码框内右侧嵌「获取验证码」白胶囊）；
              手机号 11 位、验证码 6 位填齐后，底部「登录」由淡紫禁用态变实色（设计图里就是未填齐时的样子），
              按钮下面是同一套协议勾选行（只列用户协议 / 隐私协议，不带运营商认证协议）——
              **未勾选时点「登录」与一键登录同一套提示**（键盘形态抖协议行、主 App 弹弹框）；
     done    登录成功 —— 一键登录 / 短信登录成功后先弹的一记提示（对勾 + 「登录成功」，约 1 秒），
              播完由 app.js 收起登录层、回到键盘。它不是全局轻提示（toast 组件已整体删除），
              只是登录层自己的收尾状态，仍然只占键盘那一条。
   出口：右上角 X（close-kb-login）或 Esc —— 键盘形态只关掉本次登录（仍是未登录，下次唤起键盘再弹）；
   主 App 的登录页则回来路页（appLoginReturn，见 closeAppLogin）。
   皮肤固定浅色（设计图即浅色场景）：整块通底淡蓝（2026-09-29 按需求改蓝并通体纯色，
   原为淡粉紫渐变向下渐隐到白），不跟随键盘的浅色 / 深色外观。
   设计图里的「登录 LOVEKEY · 添加聊天人设到键盘」标题、微信 / Apple 登录入口、号码旁的
   「上次登录」小标，以及短信形态的「收不到验证码？联系客服」一行按要求不呈现。
   协议勾选行里的协议名是**同一层里可点的文字按钮**（点它不切换勾选）：点开键盘内协议正文页
   （kb-legal，动作 kb-legal:<key>）—— 正文与主 App 协议中心同一份 legal-data.js 快照，
   只是缩到键盘这条高度里滚动浏览；关掉正文页即回本层，勾选状态不动。
   本组件只产出结构；表单值由 app.js 的 bind() 实时回存 state，重渲染不丢。 */
LoveCoUI.define('shared', 'kb-login', (ctx) => {
  const { esc, icon, ib, state } = ctx;
  const close = ib('Close', '关闭登录页', 'close-kb-login', 'kbl-close');
  /* 一键登录形态的顶条：X 独占键盘菜单栏那么高的一行（.kbl-bar，高度取 --lc-toolbar-height），
     本机号 / 主按钮 / 「手机号登录」入口 / 协议行整体跟着下移这一行 —— 与「X 悬浮在右上角」的
     手机号登录形态不同，这里 X 是顶条的常规内容（见 theme.css 的 .kb-login.one-tap .kbl-bar） */
  const bar = `<div class="kbl-bar">${close}</div>`;
  /* 滑入动画只在登录层新弹出的那一次渲染播放（同选图面板的机制）：重渲染不带 .entering 就不重放 */
  const enter = state.pickerEnter ? ' entering' : '';
  /* 协议名：同一层里可点的文字按钮，点开键盘内协议正文页（kb-legal，正文同一个数据源 legal-data.js）——
     仍用 <button> 保持可点语义；点它不会顺带切换勾选（label 对交互元素后代不转发激活行为） */
  const legalLink = (key, label) => `<button type="button" class="kbl-legal-link" data-action="kb-legal:${key}">${label}</button>`;
  /* 协议勾选行：两种登录形态共用同一条（同一份 state.kbLoginConsent，勾过一次两边都算数）——
     一键登录带运营商认证协议（设计图里那三份），手机号登录只用用户协议 / 隐私协议；
     未勾选时点各自的主按钮都不静默：键盘形态抖这一行、主 App 的登录页弹弹框（askDialog）。
     协议名用简称（2026-09-29 需求：一键登录 / 手机号登录页与它们的弹框里，「用户注册协议」→「用户协议」、
     「用户隐私协议」→「隐私协议」）—— 只是链接文案变短，点开的正文页标题仍是 legal-data.js 里那份
     《用户协议》/《隐私协议》，key（terms / privacy）与正文内容都不动。 */
  const consentRow = (withCarrier) => `<label class="kbl-consent"><input id="kb-login-consent" type="checkbox" ${state.kbLoginConsent ? 'checked' : ''}><span>我已阅读并同意${withCarrier ? legalLink('carrier', '中国联通认证服务协议') + '和' : ''}${legalLink('terms', '用户协议')}、${legalLink('privacy', '隐私协议')}</span></label>`;
  /* 「请阅读并同意以下条款」弹框（2026-09-29 需求，**主 App 的两张登录页专属**）：主 App 上未勾选
     协议就点主按钮不再抖协议行，而是原地盖一层弹框（照参考截图）：深色蒙层 + 居中白卡 ——
     右上角 X、居中标题、协议文案（三个协议名照常可点开键盘内协议正文页 kb-legal）、
     底部整宽蓝色胶囊「同意并继续」。协议文案与各自页面底部那条协议勾选行同一套口径：
     一键登录页带运营商认证协议、手机号登录页只列用户协议 / 隐私协议（都是简称，见 consentRow）。
     出口：X（kb-consent-close）= 只收起弹框、仍不勾选；「同意并继续」（kb-consent-agree）
     = 视作勾选（协议行同步变成已勾状态）并接着把这次被拦下的登录跑完
     （哪一次由 app.js 的 kbConsentNext 记着，见 askKbConsent）。键盘形态没有这个弹框 ——
     那一层只有一条键盘高、塞不下，仍是抖协议行（app.js 的 shakeKbConsent）。 */
  const askDialog = (withCarrier) => state.kbConsentAsk ? `<div class="kbl-ask" role="alertdialog" aria-modal="true" aria-label="请阅读并同意以下条款">
    <div class="kbl-ask-scrim" aria-hidden="true"></div>
    <div class="kbl-ask-card">
      ${ib('Close', '关闭', 'kb-consent-close', 'kbl-ask-close')}
      <h3 class="kbl-ask-title">请阅读并同意以下条款</h3>
      <p class="kbl-ask-consent">我已阅读并同意${withCarrier ? legalLink('carrier', '中国联通认证服务协议') + '和' : ''}${legalLink('terms', '用户协议')}、${legalLink('privacy', '隐私协议')}</p>
      <button type="button" class="kbl-ask-primary" data-action="kb-consent-agree">同意并继续</button>
    </div>
  </div>` : '';

  /* 登录成功提示：居中的对勾 + 「登录成功」，只占键盘那一条，约 1 秒后由 app.js 收起回键盘 */
  if (state.kbLogin === 'done') {
    return `<div class="kb-login done" role="status" aria-label="登录成功">
    <div class="kbl-done">${icon('CircleCheck')}<strong>登录成功</strong></div>
  </div>`;
  }

  if (state.kbLogin === 'sms') {
    const ready = ctx.kbLoginReady ? ctx.kbLoginReady() : false;
    return `<div class="kb-login sms${enter}" role="dialog" aria-modal="true" aria-label="手机号登录">
    ${close}
    <div class="kbl-body">
      <h2 class="kbl-title">手机号登录</h2>
      <label class="kbl-field"><input id="kb-login-phone" inputmode="numeric" maxlength="11" autocomplete="off" value="${esc(state.kbLoginPhone)}" placeholder="请输入手机号"></label>
      <div class="kbl-field kbl-code"><input id="kb-login-code" inputmode="numeric" maxlength="6" autocomplete="off" value="${esc(state.kbLoginCode)}" placeholder="请输入验证码"><button type="button" class="kbl-send" data-action="kb-login-send" ${state.kbLoginBusy ? 'disabled' : ''}>${state.kbLoginBusy ? '发送中…' : state.kbLoginSent ? '重新获取' : '获取验证码'}</button></div>
      <button type="button" class="kbl-primary" data-action="kb-login-submit" ${ready ? '' : 'disabled'}>登录</button>
      ${consentRow(false)}
    </div>
    ${askDialog(false)}
  </div>`;
  }

  return `<div class="kb-login one-tap${enter}" role="dialog" aria-modal="true" aria-label="本机号一键登录">
   <div class="kbl-body">
     ${bar}
     <div class="kbl-hero"><strong>${esc(state.phone)}</strong></div>
      <button type="button" class="kbl-primary" data-action="kb-login-one-tap">本机号一键登录</button>
      <div class="kbl-methods"><button type="button" class="kbl-method" data-action="kb-login-sms" title="用手机号验证码登录" aria-label="用手机号验证码登录">${icon('Cellphone')}<span>手机号登录</span></button></div>
      ${consentRow(true)}
    </div>
    ${askDialog(true)}
  </div>`;
});
