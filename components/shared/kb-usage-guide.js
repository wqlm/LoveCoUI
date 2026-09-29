/* 键盘使用引导（演示）—— 一个纯演示的整机覆盖层（假页面，不接真实链路）。
   它不产生截图、不发起任何 AI 请求、不动相册 / 积分 / 消息，只在引导层里把一次
   完整的使用过程演一遍（步骤由 app.js 的 state.kbGuideDemo 驱动，每一步只有高亮
   区域可点、点别处无反应，Esc 直接收场）：

     shot      仿微信聊天页（**只留**对方那句要截的话，上面不留历史记录）：页面先干净亮相
               半秒，随后遮罩淡入压暗、高亮那句话，提示「点击模拟截屏」（**无手势 emoji**）
     flash     遮罩瞬间消失 + 整屏白闪一下（模拟截图动效）+ 左下角弹出一张**大的截图卡**
               再缩成「刚截的截图」小缩略图，停约半拍后滑走（iOS 截屏动画的样子）
     composer  遮罩出现，高亮宿主输入栏 ——「点击输入框，唤出键盘」
     kb        键盘从屏幕底部弹上来（高度 0 → 常规键盘高，聊天区随之压缩）
     thumb     遮罩高亮菜单栏里那张刚截的缩略图（相册位置就地换成截图缩略图、持续跳动），
               提示贴在缩略图的**左侧**、文字右端的手指 👉 朝右指着它 ——「点这里，AI 帮你分析」
     scan      面板从底部滑入**一次**，内容区是「正在分析中…」的取景框扫描动画（约 1 秒）
     stream    同一块面板换成分析结果，打字机逐字输出：关系简报（关系阶段 / 聊天氛围
               + 分析正文）→ 两条回复思路（标题 + 回复正文）
     pick      输出完面板底部浮出悬浮按钮条，遮罩高亮第一条回复（整卡）——「点它，就用这句」
     send      面板**不收起**，遮罩改高亮面板底部那颗「发送」——「点这里，发送给他」
     win       回复进会话 + 庆祝层（「哇！你好棒呀」+ 彩带 + 「去使用吧」）—— 演完了，菜单栏
               相册位置**换回普通的图片图标**（不再是跳动的截图缩略图）

   聊天页与键盘都是本组件**自绘**的：聊天复用宿主会话的 .wx-* 骨架与皮肤，键盘的键区 /
   底栏直接复用真键盘组件（kb-keys / kb-navbar），菜单栏按同一套类名自己装配（相册位置
   换成自绘的截图缩略图 —— 与截屏瞬间浮出的那张是同一张画法，只是尺寸不同）；分析面板
   复用 .kb-chat-analysis 的皮肤，**从 scan 那一步起一直在屏**（只换内容、不重播弹入动画）。
   自绘意味着它不依赖底层画面 —— 主 App 与键盘两种形态的整机都挂这一层（app.js 的
   render / renderApp，点入不切 App形态，Esc 收场回当前形态的原页）。
   本组件只产出结构；高亮框定位（渲染后实测目标元素、把坐标写进 .gx-spot）与打字机
   （逐帧直接改 textContent）都由 app.js 的 paintKbUsageGuide() / gxTyping() 完成，
   文案表在 app.js 的 GUIDE_DEMO（ctx.guideDemo）。 */

LoveCoUI.define('shared', 'kb-usage-guide', (ctx) => {
  const { esc, icon, state, avatar, hostChat, selfAvatar, guideDemo } = ctx;
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

  /* 各步的显隐：遮罩在「停在某个目标上等点击」的五步出现（第一步延迟半秒才淡入 ——
     页面先干净亮相，随后压暗、高亮框与提示一起进场，见 theme.css 的 [data-step="shot"]）；
     面板从 scan 那一步起一直在屏（scan / stream / pick / send 共用
     同一块，只有 scan 那一次从底部滑入）；发送之后（win）会话里多了我发出的那条回复 */
  const MASK_STEPS = ['shot', 'composer', 'thumb', 'pick', 'send'];
  const SHEET_STEPS = ['scan', 'stream', 'pick', 'send'];
  const DOCK_STEPS = ['pick', 'send'];
  const PICKED = ['send', 'win'].includes(step);    /* 第一条回复的选中态（选过之后一直保留） */
  const DONE = DOCK_STEPS.includes(step);            /* 面板的完成态：底部浮出悬浮按钮条 */
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

  /* —— 「刚截的那张截图」（自绘：深色聊天页缩影 —— 顶部条 / 一条消息 / 底部输入栏）：
        截屏瞬间左下角浮出的那张，与菜单栏里那颗方形缩略图，是**同一张画法的两种尺寸** —— */
  const shotArt = (big) => `<span class="gx-shot-art${big ? ' big' : ''}" aria-hidden="true"><i class="gsa-head"></i><i class="gsa-msg"></i><i class="gsa-bar"></i></span>`;

  /* —— 键盘（自绘外壳）：键区与底栏复用真键盘组件，外层借 .keyboard 类吃同一套骨架；
        菜单栏按同一套类名装配 —— 相册（图片）位置就地换成刚截的缩略图（持续跳动） —— */
  /* —— 键盘（自绘外壳）：键区与底栏复用真键盘组件，外层借 .keyboard 类吃同一套骨架；
        菜单栏按同一套类名装配 —— 相册（图片）位置：thumb 那几步就地换成刚截的缩略图
        （持续跳动）；win 收场那一步演完了，换回普通的图片图标（不再跳动） —— */
  const thumbBtn = step === 'win'
    ? `<button type="button" class="icon-btn" tabindex="-1" aria-hidden="true">${icon('Picture')}</button>`
    : `<button type="button" class="icon-btn kb-shot-thumb" tabindex="-1" data-gx="thumb" aria-label="分析刚刚的截图">${shotArt(false)}</button>`;
  const keyboard = `<div class="gx-kb">
      <div class="keyboard gx-kb-inner">
        <div class="kb-toolbar">
          <button type="button" class="kb-user" tabindex="-1">${icon('User')}<span class="kb-user-name empty">未选择</span></button>
          <div class="kb-toolbar-end">
            <button type="button" class="icon-btn" tabindex="-1" aria-hidden="true">${icon('ChatDotRound')}</button>
            ${thumbBtn}
            <button type="button" class="icon-btn" tabindex="-1" aria-hidden="true">${icon('Setting')}</button>
          </div>
        </div>
        <div class="kb-body">${LoveCoUI.render('kb-keys', ctx)}</div>
        ${LoveCoUI.render('kb-navbar', ctx)}
      </div>
      ${SHEET_STEPS.includes(step)
        ? `<div class="kb-chat-analysis gx-sheet" role="dialog" aria-label="聊天分析">
      <header class="ca-top"><span class="ca-spark" aria-hidden="true">${glyph.spark}</span><h2>聊天分析</h2>${DONE ? '<span class="ca-sub">内容由AI生成</span>' : ''}</header>
      <div class="ca-body gx-sheet-body">
        ${step === 'scan'
          ? `<div class="kb-scan gx-scan" role="status" aria-label="正在分析中">
      <p class="scan-title">正在分析中…</p>
      <div class="scan-stage" aria-hidden="true"><i class="scan-corner tl"></i><i class="scan-corner tr"></i><i class="scan-corner bl"></i><i class="scan-corner br"></i><div class="scan-doc"><i></i><i></i><i></i></div><span class="scan-line"></span></div>
    </div>`
          : `<section class="ca-brief">
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
        </article>`}
      </div>
      ${DOCK_STEPS.includes(step)
        ? `<div class="ca-dock">
      <button type="button" class="ca-dock-btn ca-mic" tabindex="-1" aria-hidden="true">${glyph.voice}</button>
      <button type="button" class="ca-dock-btn" tabindex="-1">重新生成</button>
      <button type="button" class="ca-dock-btn" data-gx="send" tabindex="-1">发送</button>
    </div>`
        : ''}
    </div>`
        : ''}
    </div>`;

  /* —— 遮罩：全屏挡板（吃掉高亮区以外的点击）+ 高亮框 + 笔刷提示 ——
     高亮框的位置不在这里写死：app.js 渲染后实测目标元素（消息行 / 输入栏 / 缩略图 /
     回复卡 / 发送按钮）再贴合，屏幕高度、键盘状态变了也不会错位。
     mode：默认 = 提示落在目标的上方或下方（手指换向）；left = 提示贴在目标**左侧**、
     垂直居中，手指在文字右端朝右指着它（菜单栏那颗缩略图右边没地方，提示只能往左摆）。
     第一步（shot）不带手势 emoji —— 提示只有文字（2026-09-29 需求删掉手指）。 */
  const SPOT = {
    shot: ["[data-gx='shot']", 4, '点击模拟截屏'],
    composer: ['.gx-host .wx-composer', 6, '点击输入框，唤出键盘'],
    thumb: ["[data-gx='thumb']", 6, '点这里，AI 帮你分析', 'left'],
    pick: ["[data-gx='idea1']", 3, '点它，就用这句'],
    send: ["[data-gx='send']", 4, '点这里，发送给他'],
  };
  const mask = MASK_STEPS.includes(step)
    ? `<div class="gx-mask">
        <div class="gx-shield"></div>
        <div class="gx-spot" data-target="${SPOT[step][0]}" data-pad="${SPOT[step][1]}" data-mode="${SPOT[step][3] || ''}" data-action="gx-next:${step}"></div>
        <div class="gx-tip${SPOT[step][3] === 'left' ? ' gx-tip-left' : ''}" data-action="gx-next:${step}"><span class="gx-tip-text">${esc(SPOT[step][2])}</span>${step === 'shot' ? '' : `<span class="gx-tip-face" aria-hidden="true">${SPOT[step][3] ? '👉' : '👇'}</span>`}</div>
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
    ${step === 'flash' ? `<div class="gx-shot-pop" aria-hidden="true">${shotArt(true)}</div>` : ''}
    ${mask}
    ${win}
  </div>`;
});
