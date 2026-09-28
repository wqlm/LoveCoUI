/* 聊天分析面板 —— 键盘区域内的整页覆盖层，与「选择聊天截图」面板（kb-photo-picker）同一块皮肤：
   键盘整块拉高到手机屏幕的三分之二（.keyboard.with-picker），面板从下往上滑入、铺满键盘区域，
   固定深色外观（设计图即深色场景，样式见 theme.css 的 .kb-chat-analysis 一组规则）。
   入口：键盘模式下任何一次 AI 生成都先展示它 —— 选图页的「立即分析」、面板里的「重新生成」，
   以及按住底部麦克风说一句指令（语音追问：转写当输入重新生成，见 app.js 的 submitPanelVoice）；
   出口：右上 X（data-action="close-chat-analysis"）或 Esc。
   四个阶段（app.js 的 state.chatPhase 驱动）：
     loading  四张骨架占位卡（呼吸动画、彼此留白），请求在后台进行；
     stream   按页面自上而下的顺序逐段打字：关系简报（「关系阶段 / 聊天氛围」一行 → 正文）
              → AI 回复正文 → 回复思路 → 建议卡逐张（每张先策略行再回复正文）；
              打字帧由 app.js 的 paintStream() 直接改 DOM，不整页重渲染，
              因此入场动画（.enter / .fresh 作用域）只在段落真正挂载的那次渲染播放；
     done     全部输出完成：标题旁淡入「内容由AI生成」，底部浮出悬浮按钮
              （麦克风 / 重新生成 / 发送 —— 「发送」发宿主输入框的内容，输入框为空时置灰不可点），内容区超出即可滚动；
              有建议回复时整张卡可点 —— 点中即高亮并把该条回复带入聊天输入框（先清空再带入）。
     blocked  安全拦截的失败态（app.js 的 generate() 在请求被 400 拒答时切进来）：四块内容
              一概不渲染，内容区只剩一组水平垂直居中的提示 —— 盾形图标 + 文案
              「检测到敏感词，AI拒绝回答」（.ca-blocked，皮肤见 theme.css），X / Esc 关闭回干净键盘页。
   **四块内容都是「有就渲染」**（本次结果的结构由 app.js 的 makeOutcome 按输入决定），
   所以同一块面板承担两种结果：
     ① 建议回复：简报（卡内一段分析正文）+ 三组建议卡 —— 截图分析那条链路；
     ② AI 通用回复（语音追问）：**只保留一张关系简报卡**，卡里不写分析正文，
        AI 回复与回复思路并进卡内、按 markdown 排版（内容自带章节标题，
        不再套「AI 回复 / 回复思路」小标题），没有建议卡。
   本组件只产出结构；加载态骨架卡铺四张占位（比建议卡多一张，视觉上更接近满屏内容）。 */
LoveCoUI.define('shared', 'kb-chat-analysis', (ctx) => {
  const { esc, ib, state, md } = ctx;
  const glyph = window.LoveCoSystemGlyphs;
  const s = state.stream;
  const done = state.chatPhase === 'done';
  const loading = state.chatPhase === 'loading';
  /* 安全拦截态：四块内容一概不渲染（简报置空即全部跟着收起，见下面各区块的判定） */
  const blocked = state.chatPhase === 'blocked';
  const brief = blocked ? null : state.chatBrief;
  /* 打字机此刻的位置：stream 记录 {steps, i, part, card, chars} —— part 是正在输出的段落
     （grid / brief / answer / thinking / title / reply）、card 是建议卡序号（<0 = 不属于某张卡）、
     chars 是它已输出的字数。没有开启时（done / loading）全部显示全文，光标只画在正在输出的那一段末尾。 */
  const cursor = '<span id="ca-cursor" class="ca-cursor" aria-hidden="true"></span>';
  /* 段落进度尺：组件靠它判断每一块轮到没有 —— 轮到的显示（正在输出的截断 + 光标），
     还没轮到的不渲染（等打字机铺到它时才挂载、播入场动画）。建议卡另用 s.card 判。 */
  const RANK = { grid: 0, brief: 1, answer: 2, thinking: 3 };
  const at = s ? (RANK[s.part] ?? 4) : 99;   /* title / reply 是卡片段，排在最后 */

  /* —— AI 通用回复（语音追问）形态：两块并进同一张简报卡 ——
     有简报、又没有建议卡时（就是这一形态），AI 回复与回复思路不再各占一张卡，
     而是作为卡内两个 markdown 区块排在简报卡里 —— 内容自带章节标题
     （整体评价 / 分析对话节点 / 优化建议，见 app.js 的 REVIEW_ANSWER / REVIEW_THINKING），
     由 `ctx.md()` 排版（heading / 有序无序列表及缩进续行 / 引用块 / 分隔线 / 加粗都认）。
     截图分析那种结果有建议卡，那两块仍各自独立成卡（见下面的 answerBlock / thinkBlock）。 */
  const merged = !!brief && !(state.results || []).length;

  /* —— AI 回复正文（长文可滚动）——
     语音追问（AI 通用回复）的主体。轮到自己时才挂载，打字期间在末尾画光标；
     merged 时它排在简报卡里（markdown，正文近白），否则是独立的深色卡（pre-wrap 保留分段）。 */
  const aText = state.chatAnswer || '';
  const inAnswer = !!(s && s.part === 'answer');
  const answerShown = !!aText && !loading && at >= 2;
  const answerPartial = inAnswer ? aText.slice(0, s.chars) : aText;
  const answerTail = inAnswer && s.chars < aText.length ? cursor : '';
  const answerInner = merged ? md(answerPartial, answerTail) : esc(answerPartial) + answerTail;

  /* —— 回复思路（可选）——
     只有这次 AI 给了推理才有（语音追问的 AI 通用回复）：小号灰标题「回复思路」+ 正文，视觉上比 AI 回复弱一档，
     读起来是补充说明；merged 时同在简报卡里，另一张独立卡则带自己的「回复思路」标题行。 */
  const tText = state.chatThinking || '';
  const inThink = !!(s && s.part === 'thinking');
  const thinkShown = !!tText && !loading && at >= 3;
  const thinkPartial = inThink ? tText.slice(0, s.chars) : tText;
  const thinkTail = inThink && s.chars < tText.length ? cursor : '';
  const thinkInner = merged ? md(thinkPartial, thinkTail) : esc(thinkPartial) + thinkTail;

  /* 并进简报卡的两个区块（非 merged 时为空串）：与简报卡同底，标题 + 正文都是卡内元素 */
  const briefInner = merged
    ? `${answerShown ? `<div class="ca-brief-block${state.chatFx && inAnswer ? ' enter' : ''}"><div class="ca-answer-text ca-md">${answerInner}</div></div>` : ''}
       ${thinkShown ? `<div class="ca-brief-block${state.chatFx && inThink ? ' enter' : ''}"><div class="ca-think-text ca-md">${thinkInner}</div></div>` : ''}`
    : '';

  /* —— 关系简报 ——
     截图分析的结果里这一块是：顶部一行「关系阶段 / 聊天氛围」两列标签（阶段取自当前聊天对象，
     见 app.js 的 makeBrief / briefParts），下面接一段分析正文；打字顺序也是先标签行、再正文。
     语音追问（AI 通用回复）那张卡不给正文（见 app.js 的 REVIEW_BRIEF）——
     没有正文时连标签行也不渲染，它只作容器，merged 时 AI 回复与回复思路两块就挂在卡里。 */
  const bText = brief?.text || '';
  const inBrief = !!(s && s.part === 'brief');
  const inGrid = !!(s && s.part === 'grid');
  /* 标签行的打字截断：grid 段是「先打第一列、再打第二列」（与 app.js 的 briefParts() 同一份文案） */
  const g0 = `关系阶段：${brief?.stage || '熟悉'}`;
  const g1 = `聊天氛围：${brief?.vibe || '冷淡陌生'}`;
  const gc = inGrid ? s.chars : 0;
  const span1 = inGrid ? g0.slice(0, Math.min(gc, g0.length)) : g0;
  const span2 = inGrid && gc > g0.length ? g1.slice(0, gc - g0.length) : (inGrid ? '' : g1);
  const briefBlock = brief
    ? `<section class="ca-brief"${loading ? ' hidden' : ''}>
        ${bText ? `<div class="ca-brief-grid"${loading ? ' hidden' : ''}>
          <span${span1 || (inGrid && gc <= g0.length) ? '' : ' hidden'}>${esc(span1)}${inGrid && gc <= g0.length ? cursor : ''}</span>
          <span${span2 ? '' : ' hidden'}>${esc(span2)}${inGrid && gc > g0.length ? cursor : ''}</span>
        </div>
        <div class="ca-brief-text"${inGrid || loading ? ' hidden' : ''}><p>${esc(inBrief ? bText.slice(0, s.chars) : bText)}${inBrief && s.chars < bText.length ? cursor : ''}</p></div>` : ''}
        ${briefInner}
      </section>`
    : '';

  /* 不并进简报卡的那种（有建议卡时 AI 回复与回复思路各自成卡，见截图分析那条链路） */
  const answerBlock = !merged && answerShown
    ? `<article class="ca-answer${state.chatFx && inAnswer ? ' enter' : ''}"><p class="ca-answer-text">${answerInner}</p></article>`
    : '';
  const thinkBlock = !merged && thinkShown
    ? `<article class="ca-think${state.chatFx && inThink ? ' enter' : ''}"><p class="ca-think-title">回复思路</p><p class="ca-think-text">${thinkInner}</p></article>`
    : '';

  /* 建议卡片（可选）：AI 认为用户是要它帮忙回复时才有。
     还没轮到的（s.card < i）不渲染，等前一张输出完随下一次渲染挂载；
     s.card < 0 表示还在简报 / AI 回复 / 回复思路阶段，建议卡一律不出现。
     输出完成（done）后整卡可点：点中即高亮（.picked），并把该条回复带入聊天输入框
     （app.js 的 ca-pick —— 先清空输入框再带入，切换思路即替换）；打字期间不可点。 */
  const ideas = (state.results || []).map((item, i) => {
    if (s && s.card < i) return '';
    const titleAll = s && s.card === i && s.part === 'title';
    const replyAll = s && s.card === i && s.part === 'reply';
    const title = titleAll ? item.title.slice(0, s.chars) : item.title;
    const reply = replyAll ? item.reply.slice(0, s.chars) : item.reply;
    const replyStarted = !s || s.card > i || replyAll;
    const fresh = state.chatFx && s && s.card === i;
    const picked = done && state.caPicked === i;
    return `<article class="ca-card${fresh ? ' enter' : ''}${picked ? ' picked' : ''}"${done ? ` role="button" data-action="ca-pick:${i}" aria-pressed="${picked}"` : ''} data-ca="${i}">
      <p class="ca-card-title"><span class="ca-title-text">${esc(title)}${titleAll && s.chars < item.title.length ? cursor : ''}</span></p>
      <p class="ca-card-reply"${replyStarted ? '' : ' hidden'}><span class="ca-reply-text">${esc(reply)}${replyAll && s.chars < item.reply.length ? cursor : ''}</span></p>
    </article>`;
  }).join('');

  /* 加载态：四张骨架卡（长条 + 圆头 + 短条），呼吸动画错开半拍；卡间留白见 .ca-skeletons */
  const skeletons = state.chatPhase === 'loading'
    ? `<div class="ca-skeletons">${[0, 1, 2, 3].map(n => `<div class="ca-skel" style="--skel-delay:${n * .18}s">
        <div class="ca-skel-row"><i class="ca-skel-bar" style="width:56%"></i><i class="ca-skel-dot"></i></div>
        <div class="ca-skel-row"><i class="ca-skel-bar" style="width:44%"></i></div>
      </div>`).join('')}</div>`
    : '';

  /* 输出完成：底部浮出悬浮按钮（淡紫胶囊），三颗常驻 —— 麦克风 / 重新生成 / 发送。
     麦克风是「按住说话」：data-voice-hold="panel" 由 app.js 的 bind() 绑 pointerdown ——
     按住即浮出屏幕底部三分之一的蓝色毛玻璃遮罩（自下而上渐隐，正好罩住这几个按钮），
     松手转写 / 上滑取消；说完这句指令 AI 会按它重新生成（先 AI 分析过渡页，再回面板输出）。
     「发送」发的是**宿主输入框里的内容** —— 选中建议卡会把该条回复带进输入框（见 ca-pick），
     所以「点卡 → 发送」仍是原来的用法；输入框为空时这颗按钮保持灰底灰字、不可点
     （disabled，见 theme.css），有内容（选卡带入 / 在输入栏打字 / 语音转写）才亮起。 */
  const canSend = (state.host || '').trim().length > 0;
  const dock = done
    ? `<div class="ca-dock">
        <button type="button" class="ca-dock-btn ca-mic" data-voice-hold="panel" aria-label="按住说话">${glyph.voice}</button>
        <button type="button" class="ca-dock-btn" data-action="generate">重新生成</button>
        <button type="button" class="ca-dock-btn" data-action="ca-send"${canSend ? '' : ' disabled'}>发送</button>
      </div>`
    : '';

  /* 安全拦截态（blocked）：整块内容区换成一组居中提示 —— 盾形图标在上、拒绝文案在下
     （骨架卡 / 简报 / 建议卡 / 悬浮按钮都不出，见 blocked 判定）；皮肤与入场动画见 theme.css 的 .ca-blocked 一组 */
  const blockedBlock = blocked
    ? `<div class="ca-blocked" role="alert">
        <span class="ca-blocked-icon" aria-hidden="true">${glyph.shield}</span>
        <p class="ca-blocked-text">检测到敏感词，AI拒绝回答</p>
      </div>`
    : '';

  return `<div class="kb-chat-analysis${state.pickerEnter ? ' entering' : ''}${state.chatFx ? ' fresh' : ''}" role="dialog" aria-modal="true" aria-label="聊天分析">
    <header class="ca-top">
      <span class="ca-spark" aria-hidden="true">${glyph.spark}</span>
      <h2>聊天分析</h2>
      ${done ? '<span class="ca-sub">内容由AI生成</span>' : ''}
      ${ib('Close', '关闭聊天分析', 'close-chat-analysis', 'ca-close')}
    </header>
    <div class="ca-body" id="ca-body">
      ${blockedBlock}
      ${briefBlock}
      ${answerBlock}
      ${thinkBlock}
      ${skeletons}
      ${ideas}
    </div>
    ${dock}
  </div>`;
});
