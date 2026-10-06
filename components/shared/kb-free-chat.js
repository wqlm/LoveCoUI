/* 问AI（与 AI 对话）页的键盘顶部 —— 取代键盘模式的菜单栏。三端共用。
   入口：键盘菜单栏相册（图片）图标左侧的气泡按钮（data-action="free-chat"）。
   出口：标题栏右侧的 X（data-action="close-free-chat"）或 Esc —— 收起这一页回干净键盘页。
   结构自上而下（①④ 常驻，②③ 只在选中过图片时出现）：
     ① 标题栏「问AI」+ 右侧 X（高度 = --lc-toolbar-height，**顶替菜单栏**；
        打字时这一行换成候选词栏，同高，键盘不跳）—— 只在 LoveCo 键盘形态出现：
        主 App「AI 咨询师」页的常驻输入栏形态不出这一行（点输入框调出 LoveCo 键盘后才出）
     ② 已选图片缩略图行：最多 3 张，每张左上角压一枚 X（点了移出），未满 3 张时跟一枚「+」继续挑；
        ② 与 ③、③ 与 ④ 之间各有一条分隔线（整行铺满，见 theme.css 的 .free-thumbs / .free-chips）
     ③ 快捷栏：一行预设问题（帮我回 / 这样回复如何 / 我最后一轮回复的如何，见 app.js 的
        FREE_SHORTCUTS），**点一下立即发送** —— 点哪条决定结果结构：「帮我回」→ 聊天分析
        （关系简报 + 三组建议），其余 → AI通用回复（见 app.js 的 pickFreeShortcut / sendFreeChat）。
        三条在窄机上放不下，这一行可左右滑（横向滚动、滚动条隐藏，见 .free-chips）；按钮文字不带箭头符号
     ④ 提问输入行：圆形头像 + 提问输入框（state.freeText）+ 右端两枚按钮（自左向右）——
        头像 = 当前聊天对象（点击进聊天对象管理页；主 App「AI 咨询师」页改成从底部弹出
        对象列表、选完即收，见 app.js 的 aiSheetHtml）
        「语音」（data-voice-hold="free"，**按住即进「按住说话」**，见 app.js 的 beginVoiceHold）
        与「图片」（data-action="free-picker"，点了展开选图；主 App「AI 咨询师」页则是从底部
        弹出 2 行图片高度的截图窗口）；图片选择器展开且已选图时后者
        换成蓝色圆形「发送」按钮（data-action="free-send"，点了直接发送）——
        发送按钮里那枚白色箭头是 SEND_ARROW，就地内联（icons.js 是生成物，这类一次性图形不进图标集，
        与 system-glyphs.js 里那几个图形同一套做法）
     提问输入框（#free-chat）：点它输入（与宿主输入框同一套输入法 —— 拼音字母带下划线落在框里、
     候选词替换、删除键先删字母、多行时自动长高最多三行，见 app.js 的 paintFreeInputGrowth）。
     **占位文案**（2026-10-06 晚些需求起主 App「AI 咨询师」页固定「输入或按住说话」——
     这一页的输入栏常驻、键盘点输入框才调出，文案不随键盘在不在变，与豆包的输入栏一致）；
     键盘形态的问AI 页仍是**两态**（与「按住说话」的入口一起变）：
      · 键区在下面（键盘激活，键区打字的目标就是这行框）：占位「输入问题」—— 框里停着光标，
        长按框是编辑 / 选字的手势，**不进语音**，语音只能按右端那颗语音按钮；
      · 图片选择器展开（框下方是截图网格）：占位「输入问题或按住说话」—— 没有光标抢占，
        按住框（260ms，见 app.js 的 startFreeVoiceWatch）与按语音按钮都进语音。
     进语音后与其它入口同一套：与键盘区域同高的语音遮罩盖住整块键盘（含这行输入框与下方的
     键区 / 图片选择器网格），上滑取消、松手直接发送（连同已选图片）。
   键区打字落在这行输入框上（app.js 的 targetValue / targetCaret / setTargetValue），
   键区右下角那颗蓝键在这个场景是「发送」—— 按下把这句话交给 AI
   （过渡页 → 生成中 → 聊天分析 / AI通用回复，见 app.js 的 sendFreeChat）。
   图片选择器不在这里：展开时由 kb-photo-picker 的**内嵌形态**渲染在输入行下方，
   从底部往上滑出、盖住键区（见 app.js 的 openFreePicker 与 theme.css 的 .free-picker）；
   主 App「AI 咨询师」页里同一个内嵌形态改挂在**底部弹窗**里（.aai-sheet，2 行图片高度、可滚，
   见 app.js 的 aiSheetHtml / paintAaiSheet）—— 这一页不出「问AI」标题栏，也不盖键区。
   键区也不在这里：底部的键区、大小、状态（布局 / 层 / 中英）完全继承进入这一页前的页面，
   见 theme.css 的 .keyboard.free-chat —— 标题栏顶替菜单栏（同高，不额外占高），
   缩略图 / 快捷栏 / 输入行涨出来的实际高度由 app.js 记进 --lc-free-extra
   （整块键盘按它往上长，键区高度不变）；主 App「AI 咨询师」页的键盘是点输入框才调出的
   （state.aaiKb，见 aiKeyboardArea），调出后结构与本组件这一套一致。 */
LoveCoUI.define('shared', 'kb-free-chat', (ctx) => {
  const { esc, icon, ib, shot, state, personName, partnerAvatar, freeChatDisplay, photos, freeShortcuts } = ctx;
  const glyph = window.LoveCoSystemGlyphs;

  const title = `<div class="free-title"><strong>问AI</strong>${ib('Close', '退出问AI', 'close-free-chat')}</div>`;

  /* 已选图片：与输入行下方的图片选择器读**同一份** state.selectedPhotos（选 / 取消都同步，最多 3 张）。
     缩略图用 shot() 现场画（与选择器网格同一套画法），点它 = 移出（复用选择器的 photo:<id> 动作，
     已选中再点即取消）；未满 3 张时跟一枚「+」继续挑（free-picker-add，展开选择器）。 */
  const picked = state.selectedPhotos.map(id => photos().find(s => s.id === id)).filter(Boolean);
  const thumbs = picked.length ? `<div class="free-thumbs">${picked.map(s => `<button type="button" class="free-thumb" data-action="photo:${esc(s.id)}" title="移除这张截图" aria-label="移除「${esc(s.name)}」">${shot(s)}<i class="free-thumb-x" aria-hidden="true">${icon('Close')}</i></button>`).join('')}${picked.length >= 3 ? '' : `<button type="button" class="free-thumb-add" data-action="free-picker-add" title="再选一张截图" aria-label="再选一张截图">${icon('Plus')}</button>`}</div>` : '';
  /* 快捷栏：**点一下立即发送**（见 app.js 的 pickFreeShortcut）—— 没有选中态、不加箭头符号，
     按钮上只留那句短语；点哪条决定结果结构，所以 title 直接写「立即发送」 */
  const chips = picked.length ? `<div class="free-chips">${freeShortcuts.map(q => `<button type="button" class="free-chip" data-action="free-shortcut:${q.id}" title="立即发送「${esc(q.label)}」">${esc(q.label)}</button>`).join('')}</div>` : '';

  /* 发送按钮里的箭头：圆头竖杆 + 两条撇，画在 24 的视图里（stroke 2.4 → 撑到 17px 约 1.7px 粗）。
     icons.js 是生成物，这种一次性图形就地内联（与 system-glyphs.js 里那几个图形同一套做法）；
     路径与其它图标一样取 currentColor，深色外观下由样式换成深色（见 theme.css 的 .free-send）。 */
  const SEND_ARROW = '<svg class="free-send-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 19.2V5.4M12 5.4 5.7 11.7M12 5.4l6.3 6.3" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path></svg>';

  /* 右端按钮的一枚两态：选择器收起 = 「图片」按钮（点了展开选图）；
     选择器展开且已选图 = 蓝色圆形「发送」按钮（点了直接发送，见 sendFreeChat） */
  const button = state.freePicker && picked.length
    ? `<button type="button" class="free-send" data-action="free-send" title="发送" aria-label="发送（含已选 ${picked.length} 张截图）">${SEND_ARROW}</button>`
    : ib('Picture', '选择聊天截图', 'free-picker', 'free-photo');

  /* 语音输入按钮：按住即进「按住说话」（data-voice-hold="free" 由 app.js 的 bind 统一绑 pointerdown：
     按下就进按住态、顺带 preventDefault 保住框里的光标，松手由 onVoiceUp 的 source='free' 接手 →
     仿真转写并入提问框后直接发送）。键区在下面时它是这一页**唯一**的语音入口 —— 那时框里停着光标
     （键区打字的目标就是它），长按框留给编辑 / 选字；图片选择器展开时按住框与按它都行
     （见 app.js 里 #free-chat 的 pointerdown 判定与 startFreeVoiceWatch）。
     图形取 system-glyphs 的 voice —— 与键盘底栏那颗语音键同一枚麦克风（同一件事：按住说话）。 */
  const voiceBtn = `<button type="button" class="icon-btn free-voice" data-voice-hold="free" title="按住说话" aria-label="按住说话">${glyph.voice}</button>`;

  /* 主 App「AI 咨询师」页（app-ai）的形态标记：这一页的输入栏常驻、键盘点输入框才调出
     （标题栏 / 占位文案 / 语音入口都按它分叉） */
  const appAi = state.appView === 'app' && state.appScreen === 'app-ai';

  /* 占位文案（2026-10-06 晚些需求）：主 App「AI 咨询师」页固定「输入或按住说话」—— 与豆包的
     输入栏一致，键盘在不在屏都是这一句；键盘形态的问AI 页保持原两态（与「按住说话」的入口一起变）：
     键区在下面时「输入问题」，图片选择器展开时「输入问题或按住说话」（那时按住框也进语音） */
  const placeholder = appAi ? '输入或按住说话' : state.freePicker ? '输入问题或按住说话' : '输入问题';

  /* id="free-chat" 被 app.js 绑定输入 / 光标位置 / 下划线镜像 / 按住说话，改名会破坏这一页的输入链路。
     外层的 .input-wrap 里压着 .compose-mirror：给未确认的那段字母画下划线
     （textarea 自己被整块文本占满，没法只给一段字加线），由 app.js 的 paintComposeMirror 填内容。
     输入行右端两枚按钮的顺序：语音在前（贴着输入框）、图片 / 发送在后（保持它在行的最右端）。 */
  const input = `<div class="free-input-row">
    <button type="button" class="free-partner" data-action="partner-manager" title="${appAi?'选择聊天对象':'聊天对象管理'}" aria-label="${appAi?'选择聊天对象':'聊天对象管理'}：${esc(personName())}">${partnerAvatar()}</button>
    <div class="input-wrap"><div class="compose-mirror" data-mirror="free-chat" aria-hidden="true"></div><textarea id="free-chat" class="free-input" rows="1" maxlength="1500" aria-label="${appAi ? '提问输入框：点一下调出键盘，或按住说话' : state.freePicker ? '提问输入框：点一下输入，按住说话' : '提问输入框：点一下输入你的问题，语音走右边的按钮'}" placeholder="${placeholder}">${esc(freeChatDisplay())}</textarea></div>
    ${voiceBtn}
    ${button}
  </div>`;

  /* 标题栏（与打字时的候选词栏）只在**LoveCo 键盘形态**出现：
     · 键盘形态的问AI 页：脚下就是 LoveCo 键盘，照旧出标题栏（打字时换候选词栏）；
     · 主 App「AI 咨询师」页：默认只有贴底的输入栏（点输入框才调出键盘，见 app.js 的
       aiKeyboardArea），不出标题栏 —— 点输入框调出的**当前键盘**就是 LoveCo 键盘
       （当前输入法 = LoveCo）时，与键盘形态一致地出标题栏、打字时换候选词栏；
       调出的若是系统键盘，则不出（那不是 LoveCo 键盘的页头）。 */
  const lovecoKb = state.permissions.kbEnabled && state.permissions.ime === 'loveco';
  const head = state.permissions.kbEnabled && (!appAi || (state.aaiKb && lovecoKb)) ? (state.typing ? LoveCoUI.render('kb-candidates', ctx) : title) : '';
  return `<div class="kb-free-chat">${head}${thumbs}${chips}${input}</div>`;
});
