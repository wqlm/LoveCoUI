/* 键盘使用引导（演示）—— 一个纯演示的整机覆盖层（假页面，不接真实链路）。
   它不产生截图、不发起任何 AI 请求、不动相册 / 积分 / 消息，只在引导层里把一次
   完整的使用过程演一遍（步骤由 app.js 的 state.kbGuideDemo 驱动，每一步只有高亮
   区域可点、点别处无反应，Esc 直接收场）：

     shot      仿微信聊天页 + 半透明遮罩，高亮对方最后一句话（「点这里，模拟截屏」）
     flash     遮罩消失、整屏白闪一下（模拟截图动效）
     composer  遮罩回来，改高亮宿主输入栏（「点这里，唤出键盘」）
     kb        键盘从屏幕底部弹上来（高度 0 → 常规键盘高，聊天区随之压缩）
     thumb     遮罩再回来，高亮菜单栏里刚截的那张缩略图（相册图标就地换成截图缩略图、
               持续跳动）——「点这里，AI 帮你分析」
     scan      约 1 秒的「AI 分析」过渡动画（复用 kb-scan 的取景框 + 扫描线皮肤）
     stream    打字机输出聊天分析：关系简报（关系阶段 / 聊天氛围 + 分析正文）
               → 两条回复思路（标题 + 回复正文）
     pick      遮罩高亮第一条回复（整卡）——「点它，就用这句」
     send      整卡亮起、面板收起、回复带入输入框、高亮移到键盘右下角「发送」键
     win       回复进会话 + 庆祝层（「哇！你好棒呀」+ 彩带 + 「去使用吧」）

   聊天页与键盘都是本组件**自绘**的（不读底层手机的状态）：聊天复用宿主会话的
   .wx-* 骨架与皮肤类，键盘的键区 / 底栏直接复用真键盘组件（kb-keys / kb-navbar），
   菜单栏按同一套类名自己装配（相册位置换成截图缩略图）。
   本组件只产出结构；高亮框定位（渲染后实测目标元素、把坐标写进 .gx-spot）与打字机
   （逐帧直接改 textContent）都由 app.js 的 paintKbUsageGuide() / gxTyping() 完成，
   文案表在 app.js 的 GUIDE_DEMO（ctx.guideDemo）。 */

LoveCoUI.define('shared', 'kb-usage-guide', (ctx) => {
  const { esc, icon, state, avatar, hostChat, selfAvatar, shotThumb, guideDemo } = ctx;
  const step = state.kbGuideDemo;
  if (!step || !guideDemo) return '';
  const glyph = window.LoveCoSystemGlyphs;
  const G = guideDemo;
  const typed = state.gxTyped || 0;

  /* 打字机：文案按 order 顺序拼接，state.gxTyped 是已输出字数 —— 渲染时按它截断
     （重渲染后停在原地接着显示），帧内的推进由 app.js 的 gxTyping() 直接改文本。
     正在输出的那一段带 .gx-typing（末尾画光标，见 styles.css 的 .gx-typing:after）。 */
  const offset = {};
  let acc = 0;
  for (const key of G.order) { offset[key] = acc; acc += G.text[key].length; }
  const typeSpan = (key) => {
    const full = G.text[key];
    const take = Math.max(0, Math.min(full.length, typed - offset[key]));
    const now = take > 0 && take < full.length;
    return `<span class="gx-type${now ? ' gx-typing' : ''}" data-gx-type="${key}">${esc(full.slice(0, take))}</span>`;
  };

  /* 各步的显隐：遮罩只在「停在某个目标上等点击」的五步出现；分析面板在输出 / 选回复两步；
     发送之后（send / win）会话里多了我发出的那条回复 —— 与按钮文案同源（G.text.r1） */
  const MASK_STEPS = ['shot', 'composer', 'thumb', 'pick', 'send'];
  const SHEET_STEPS = ['stream', 'pick'];
  const PICKED = ['send', 'win'].includes(step);    /* 第一条回复的选中态（选过之后一直保留） */
  const composerText = step === 'send' ? G.text.r1 : '';

  /* —— 聊天页（自绘）：头像与底色取宿主会话那一套（HOST_CHAT / 微信深色皮肤） —— */
  const peer = avatar(hostChat.name, hostChat.color, hostChat.avatar);
  const mine = selfAvatar();
  const rows = G.messages.map((m) => `${m.time ? `<div class="wx-time">${esc(m.time)}</div>` : ''}<div class="wx-msg ${m.mine ? 'mine' : ''}"${m.hot ? ' data-gx="shot"' : ''}>${m.mine ? '' : peer}<div class="wx-bubble">${esc(m.text)}</div>${m.mine ? mine : ''}</div>`).join('');
  const sentRow = step === 'win'
    ? `<div class="wx-msg mine fresh"><div class="wx-bubble">${esc(G.text.r1)}</div>${mine}</div>`
    : '';
  const chat = `<div class="gx-host">
      <header class="wx-header"><div class="wx-title">${esc(hostChat.name)}</div></header>
      <div class="wx-chat gx-chat" id="gx-chat">${rows}${sentRow}</div>
      <div class="wx-composer"><span class="wx-circle">${glyph.wxVoice}</span><div class="input-wrap wx-field">${composerText ? `<div class="gx-field-text">${esc(composerText)}</div>` : ''}</div>${composerText ? '<span class="wx-send">发送</span>' : `<span class="wx-circle">${glyph.wxEmoji}</span>`}</div>
    </div>`;

  /* —— 键盘（自绘外壳）：键区与底栏复用真键盘组件，外层借 .keyboard 类吃同一套骨架；
        菜单栏按同一套类名装配 —— 相册（图片）位置就地换成刚截的缩略图（持续跳动） —— */
  const keyboard = `<div class="gx-kb">
      <div class="keyboard gx-kb-inner">
        <div class="kb-toolbar">
          <button type="button" class="kb-user" tabindex="-1">${icon('User')}<span class="kb-user-name empty">未选择</span></button>
          <div class="kb-toolbar-end">
            <button type="button" class="icon-btn" tabindex="-1" aria-hidden="true">${icon('ChatDotRound')}</button>
            <button type="button" class="icon-btn kb-shot-thumb" tabindex="-1" data-gx="thumb" aria-label="分析刚刚的截图"><img src="${shotThumb(G.shot)}" alt=""></button>
            <button type="button" class="icon-btn" tabindex="-1" aria-hidden="true">${icon('Setting')}</button>
          </div>
        </div>
        <div class="kb-body">${LoveCoUI.render('kb-keys', ctx)}</div>
        ${LoveCoUI.render('kb-navbar', ctx)}
      </div>
      ${step === 'scan'
        ? `<div class="kb-photo-picker kb-scan" role="status" aria-label="正在分析中">
      <p class="scan-title">正在分析中…</p>
      <div class="scan-stage" aria-hidden="true"><i class="scan-corner tl"></i><i class="scan-corner tr"></i><i class="scan-corner bl"></i><i class="scan-corner br"></i><div class="scan-doc"><i></i><i></i><i></i></div><span class="scan-line"></span></div>
    </div>`
        : ''}
      ${SHEET_STEPS.includes(step)
        ? `<div class="kb-chat-analysis gx-sheet" role="dialog" aria-label="聊天分析">
      <header class="ca-top"><span class="ca-spark" aria-hidden="true">${glyph.spark}</span><h2>聊天分析</h2><span class="ca-sub">内容由AI生成</span></header>
      <div class="ca-body gx-sheet-body">
        <section class="ca-brief">
          <div class="ca-brief-grid"><span>关系阶段：${esc(G.text.stage)}</span><span>聊天氛围：${esc(G.text.vibe)}</span></div>
          <div class="ca-brief-text"><p>${typeSpan('brief')}</p></div>
        </section>
        <article class="ca-card${PICKED ? ' picked' : ''}" data-gx="idea1">
          <p class="ca-card-title"><span class="ca-title-text">${typeSpan('t1')}</span></p>
          <p class="ca-card-reply"><span class="ca-reply-text">${typeSpan('r1')}</span></p>
        </article>
        <article class="ca-card">
          <p class="ca-card-title"><span class="ca-title-text">${typeSpan('t2')}</span></p>
          <p class="ca-card-reply"><span class="ca-reply-text">${typeSpan('r2')}</span></p>
        </article>
      </div>
    </div>`
        : ''}
    </div>`;

  /* —— 遮罩：全屏挡板（吃掉高亮区以外的点击）+ 高亮框 + 笔刷提示 ——
     高亮框的位置不在这里写死：app.js 渲染后实测目标元素（消息行 / 输入栏 / 缩略图 /
     回复卡 / 发送键）再贴合，屏幕高度、键盘状态变了也不会错位。 */
  const SPOT = {
    shot: ["[data-gx='shot']", 4, '点这里，模拟截屏'],
    composer: ['.gx-host .wx-composer', 6, '点这里，唤出键盘'],
    thumb: ["[data-gx='thumb']", 6, '点这里，AI 帮你分析'],
    pick: ["[data-gx='idea1']", 3, '点它，就用这句'],
    send: ['.gx-kb .key.accent', 4, '点这里，发送给他'],
  };
  const mask = MASK_STEPS.includes(step)
    ? `<div class="gx-mask">
        <div class="gx-shield"></div>
        <div class="gx-spot" data-target="${SPOT[step][0]}" data-pad="${SPOT[step][1]}" data-action="gx-next:${step}"></div>
        <div class="gx-tip" data-action="gx-next:${step}"><span class="gx-tip-face" aria-hidden="true">👆</span><span class="gx-tip-text">${esc(SPOT[step][2])}</span></div>
      </div>`
    : '';

  /* —— 庆祝层（win）：彩带 / 「哇！你好棒呀」/「去使用吧」（点它收场并跳主 App 首页） —— */
  const confetti = Array.from({ length: 26 }, (_, i) => `<i style="--x:${(i * 37 + 11) % 100};--delay:${(((i * 13) % 10) / 10).toFixed(1)}s;--dur:${(2.3 + ((i * 7) % 10) / 10).toFixed(1)}s;--rot:${(i % 2 ? 1 : -1) * (140 + (i % 5) * 90)}deg;--c:${['#4C7DF0', '#F5A623', '#F06A6A', '#FFFFFF', '#6BCB77'][i % 5]}"></i>`).join('');
  const win = step === 'win'
    ? `<div class="gx-win">
        <div class="gx-confetti" aria-hidden="true">${confetti}</div>
        <p class="gx-win-title">哇！你好棒呀</p>
        <button type="button" class="gx-win-btn" data-action="gx-next:win">去使用吧</button>
      </div>`
    : '';

  return `<div class="kb-usage-guide" data-step="${step}" role="dialog" aria-modal="true" aria-label="键盘使用引导（演示）">
    <div class="gx-body">${chat}${keyboard}</div>
    ${step === 'flash' ? '<div class="gx-flash" aria-hidden="true"></div>' : ''}
    ${mask}
    ${win}
  </div>`;
});
