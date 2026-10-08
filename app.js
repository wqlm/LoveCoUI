/* Local-only interaction prototype. Requests below never use fetch or XHR. */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  /* 渲染工具统一来自 core/kit.js，与 components/ 下的组件共用同一套实现 */
  const { esc, icon, ib, primary, avatar, noneAvatar, shot, shotThumb } = window.LoveCoKit;
  /* 输入法内核：候选词计算，供候选词栏组件与下面的输入法逻辑共用 */
  const ime = window.LoveCoIME;
  const STORE = 'loveco-keyboard-prototype-v1';
  const route = new URLSearchParams(location.search);
  document.documentElement.dataset.view = route.get('view') === 'device' ? 'device' : 'workbench';
  /* 默认头像插画来自 assets/avatars.js（data URI）：`chat` 是**聊天对象的默认头像**
     （2026-10-06 需求起三个对象共用这一张，旧键 p1 / p2 / p3 作废）、`self` 是「我」的；
     缺失时 avatar() 自动退回首字兜底。 */
  const AV = window.LOVECO_AVATARS || {};
  /* 老存档里的默认头像识别（前缀见 assets/avatars.js 的 retiredPrefix）：AI 生成的内联图都带
     JFIF + Exif 头，而用户自己上传 / 从候选里选的头像都经 canvas 重压、不带 Exif —— 认得出、
     不会误伤。老 localStorage 把默认头像当「用户头像」存过，加载时用它认出来丢掉。 */
  const retiredAvatar = (v) => typeof v === 'string' && !!AV.retiredPrefix && v.startsWith(AV.retiredPrefix);
  const keepAvatar = (v) => retiredAvatar(v) ? '' : (v || '');
  /* 宿主 App（微信）固定聊天模板：第三方 App 的会话不随键盘侧切换聊天对象而变 ——
     切对象只影响 LoveCo 键盘的上下文与生成；会话的备注名 / 头像 / 种子消息永远演同一套
     （host-app 头部、chat-area 对方头像、会话菜单「当前会话」都读这里）。
     对方头像用系统内置的女生头像（AV.peer = mock-1「长发女生」的内嵌 data URI，见
     assets/avatars.js；2026-10-06 需求：聊天样式页不再用 akalin 线稿 —— 键盘页的用户头像
     图标不受影响、仍是 akalin）。kb-usage-guide 的聊天页也读 hostChat.avatar，跟着生效。 */
     const HOST_CHAT = { name:'林间', color:'coral', avatar:AV.peer||'' };
  /* 键盘使用引导（kb-usage-guide 组件，纯演示的假页面）的固定剧本：聊天记录、分析结果
     与那张「刚截的截图」。整个引导不接真实链路（不截图、不发请求、不动积分与消息），
     文案就写在这一份里 —— 组件渲染截断（按 state.gxTyped）、gxTyping() 逐帧推进，
     两边共用同一份数据，改文案只改这里。
     order 是打字机的输出顺序：关系简报正文 → 第一条回复（标题 / 正文）→ 第二条同理。 */
  const GUIDE_DEMO = {
    text: {
      stage: '熟悉',
      vibe: '相互拉扯试探',
      brief: '她借爸爸的话试探你的态度：边界感里带着心动。顺着话题接住，比讲道理更加分。',
      t1: '高情商接梗',
      r1: '爸爸说的对，离花言巧语的要远一点，但离心动的可以近一点。',
      t2: '幽默自嘲',
      r2: '完了，这下要被爸爸警告了',
    },
    order: ['brief', 't1', 'r1', 't2', 'r2'],
    /* 聊天页剧本：**只留一条**（要「截」的那句话）—— 上面不留历史记录，第一屏保持干净 */
    messages: [
      { time: '9月27日 星期日 09:07', text: '爸爸说，离花言巧语的男生要远一点。', mine: false, hot: true },
    ],
  };
  /* 「刚截的截图」用真机截图资产（2026-09-29 起，换掉此前自绘的「聊天页缩影」骨架）：
     截屏瞬间左下角浮出的大卡 = assets/guide-chat-shot.png（618×1352 的全屏聊天页），
     菜单栏那颗持续跳动的方形缩略图 = assets/guide-chat-thumb.png（同一张裁出的 618×618 方形版）
     —— 同一屏的两个尺寸，「刚截的截图」长什么样一眼就对得上（重截步骤见 README 维护说明） */
  /* 三个默认聊天对象：2026-10-06 需求起共用同一张默认头像（AV.chat，用户提供的中性插画）——
     原先各有一张 AI 插画（AV.p1 / p2 / p3），当天「统一换成」这一张 */
  const initialPartners = [
    {id:'p1',name:'林间',gender:'女',stage:'暧昧',note:'喜欢周末散步、独立书店和不太甜的咖啡。',color:'coral',avatar:AV.chat||''},
    {id:'p2',name:'陈一',gender:'男',stage:'熟悉',note:'最近在筹备摄影展，喜欢轻松直接的聊天。',color:'blue',avatar:AV.chat||''},
    {id:'p3',name:'小满',gender:'暂不设置',stage:'初识',note:'负责产品设计，工作沟通以清楚、友好为主。',color:'',avatar:AV.chat||''}
  ];
  /* 关系阶段：按关系由浅到深的五档，新建对象的默认档位是「熟悉」。
     键盘编辑面板（kb-partner-editor）与主 App 对象弹层共用这一份档位表。 */
  const stages = ['初识','熟悉','暧昧','恋人','伴侣'];
  const DEFAULT_STAGE = '熟悉';
  /* 旧档位 → 新档位：localStorage 里的老对象（朋友 / 暧昧期 / 同事 / 家人）按这张表迁移，
     认不出的值（含历史脏数据）一律落到默认档位 —— 否则下拉框里会显示一个档位表外的旧值 */
  const STAGE_MIGRATION = {'朋友':'熟悉','暧昧期':'暧昧','同事':'熟悉','家人':'伴侣'};
  function normalizeStage(v){ return stages.includes(v) ? v : (STAGE_MIGRATION[v] ?? DEFAULT_STAGE); }
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch (_) {}
  /* 「模拟试用额度耗尽」的**开关状态与快照**也要跟着本地恢复（原来只存了被清零的积分）：
     只存积分不存开关，刷新后开关显示为关、积分却是 0 —— 一发起生成就弹「会员与积分」，
     看着像开关失灵。顺带兜一条旧数据：开关关着而积分 < 1（旧版本留下的脏值）时回到初始额度。 */
  const creditsOut = saved.creditsOut === true;
  const savedCredits = Number.isFinite(saved.credits) ? saved.credits : 28;
  /* App形态：app = LoveCo 主 App 界面，keyboard = 宿主 App 内唤起的 LoveCo 键盘。
     2026-10-04 起**缺省即主 App**（用户需求：「网页打开时，app形态 默认为主app」）——
     原来缺省是键盘形态，想看键盘用 `?surface=keyboard` 显式指定。 */
  const surfaceParam = ['app','keyboard'].includes(route.get('surface')) ? route.get('surface') : '';
  /* 重渲染把焦点还给 #host 时的标记：这类 focus 不是用户主动聚焦，只是渲染后的还原。 */
  let restoringFocus = false;
  const state = {
    platform: ['harmony','android','ios'].includes(route.get('platform')) ? route.get('platform') : saved.platform || 'harmony', typing:false,
    dark: saved.dark || false, layout: saved.layout || 'qwerty', language:'zh', layer:'letters', shift:false, symbolCat:'常用',
    /* draft 是 AI 请求的输入文本（截图转写 / 最近一条种子消息），只在页面内存里，不再有输入框 */
    composition:'', t9Path:0, host:'', hostCaret:0, draft:'今天有点累，感觉什么都没做好。',
    /* 登录状态默认关（2026-09-28 需求；2026-10-06 起「设备权限」那三个开关已改成默认开，只有这一颗
       「模拟 › 登录状态」还默认关）—— 未登录启动时键盘被唤起先弹登录层、主 App 落首页前弹登录层；
       老存档里的登录态照旧恢复 */
    loggedIn:saved.loggedIn === true, phone:'138****8000', nickname:saved.nickname || '小周',
    credits: creditsOut || savedCredits > 0 ? savedCredits : 28, member:saved.member || false,
    /* 会员到期时间戳：0 = 永久（键盘内「永久会员」档 / 左栏「模拟 › 会员状态」下拉的永久档），
       正数 = 到期时刻（下拉里的「订阅会员」档，落今天 +30 天），null = 老存档 / 已开通但没有
       到期日（只知道自己开了会员、不知道何时到期）——
       「我的」页的会员横幅只在有值时才打出到期日（「2026-09-30到期」那行，右对齐），
       不给老数据硬编一个假日期。 */
    memberExpiry: Number.isFinite(saved.memberExpiry) ? saved.memberExpiry : null,
    /* 老 localStorage 存档里的头像分三类：用户自己上传 / 从候选里选的（canvas 重压、保留）、
       2026-10-06 之前存下来的**旧默认头像**（AI 生成带 Exif，retiredAvatar 认出来丢掉 —— 当天
       换了默认头像，老存档不该还挂着旧的三张）、空值。后两类都落到新默认头像
       （渲染侧由 partnerAvatar 用 AV.chat 兜底）。 */
    partners: Array.isArray(saved.partners)
      ? saved.partners.map(p=>({...p, avatar:keepAvatar(p.avatar), stage:normalizeStage(p.stage)}))
      : structuredClone(initialPartners),
    /* 删除聊天对象是真删除：DELETE 仿真请求成功后从 partners 里移除并 persist 落库，
       列表渲染直接读 partners（不再有隐藏层），退出列表再进来 / 刷新页面都不会再出现。
       partnersRemoving 记正在播删除收起动画的行（id → 实测行高 px）：
       点击删除即标记，渲染时该行挂 .removing 播 0.5s 收起动画（上移淡出 + 高度收到 0，
       下方行同步顶上去），请求返回后才真正移除。
       partnersEmptyDemo 只服务页面列表的「空列表」形态：置位时列表按空态渲染、不动对象数据，
       kbReset / 进入管理页都会清掉。 */
    selectedPartner:'p1', partnersRemoving:new Map(), partnersEmptyDemo:false, messages:[], selectedPhotos:[], results:[],
    pending:false, activeRequest:null, generation:0, calls:0,
    /* 打字机：思路卡片逐字输出。stream = {card,part,chars,generation} —— card 是正在输出的
       思路卡（0 起），part 是卡里的哪一段（title 策略 / reply 回复），chars 是它已输出的字数。 */
    stream:null, streamTimer:null,
    /* 聊天分析面板（kb-chat-analysis）：键盘模式下每次 AI 生成先展示它。
       chatPhase：loading（骨架占位）→ stream（打字机逐段输出）→ done（浮出悬浮按钮）；
              blocked 是失败分支 —— 安全拦截时面板停在这一态（居中提示「检测到敏感词，AI拒绝回答」，见 generate() 的 catch）；
       chatBrief 是**本次**的关系简报（一段正文，{text}），chatAnswer / chatThinking 是 AI 回复正文与回复思路
       （都可能为空，空则整块不渲染），caPicked 是选中的建议卡序号，
       chatFx 是带一次性入场动画的渲染标记（renderFresh() 置位，渲染完即摘），
       pendingBrief 是请求发起时定好的简报（openChatPanel 取它填 chatBrief）。
       draftKind 记**本次输入**是哪一类：chat（截图转写 / 打字，结果恒为三组建议回复）/
       review（语音追问，见 VOICE_QUERIES —— 只有一种结果结构：简报 + AI 回复 + 回复思路）。
       chatLoadingAt 是本次加载态（骨架屏）的起点时刻：结果先回来时也要让它停留一小段
       （见 beginStreamFromLoading），免得「生成中」一闪而过。 */
    chatPanel:false, chatPhase:'loading', chatBrief:null, chatAnswer:'', chatThinking:'', caPicked:-1, chatFx:false, pendingBrief:null, draftKind:'chat', chatLoadingAt:0,
    /* outcome 只走 success / blocked 两种：左栏「模拟安全拦截」开关在这两者间切换
       （原「请求结果」下拉连同「服务异常 503」「请求超时 408」的入口已删除，api() 里这两条分支保留供手改状态验证）。
       blocked 时聊天分析面板停在拦截态给出「检测到敏感词，AI拒绝回答」提示（见 generate() 的 catch）。 */
    outcome:'success',
    /* 「模拟试用额度耗尽」是开关：打开时把积分清零并去掉会员标识，原值存进 creditsSnapshot，关掉即还原。
       开关状态与快照都持久化（见上面的 creditsOut / savedCredits）：刷新后开关仍按原位显示、
       关掉时还原的是真实的原值，不会再出现「开关关着、额度却是 0」的错位 */
    creditsOut, creditsSnapshot:saved.creditsSnapshot || null,
    /* 「首启引导」开关（2026-10-06 需求；左栏「模拟」组里的一行，两种 App形态都渲染、默认关）：
       模拟「这台设备刚装上 App、第一次打开」这一场景 —— 打开（见 firstLaunchReset）即
       ① 把设备权限摆回新机：开启键盘 / 键盘完全访问 关、当前输入法回系统默认、
          相册访问权限回「关闭」，只留「蜂窝网络」（网络访问 / 麦克风没有 UI 入口、照旧）；
       ② 把「模拟」组里的其它开关也复位：登录状态 / 模拟试用额度耗尽（照开关那套还原原值快照）/
          会员状态（回「未开通」）/ 模拟安全拦截 全关，「已设置性别」一并复位成关（新设备 = 性别还没设置）；
       ③ 切到主 App 形态并从头跑一遍进入检查 —— 键盘没启用，主 App 整页落「开启键盘」引导页。
       整条首启链路（键盘引导 → 登录 → 资料引导 → 键盘使用引导演示 → 首页 →
       **自动弹出的付费墙那一轮**；2026-10-08 需求把演示挪到链路最后，见 guideAfterSwitch）
       走完才自动复位成关（见 clearFirstLaunch；模拟的是一个一次性场景，中途每一站开关都保持打开）。
       **2026-10-06 再晚些需求：结束时机往后延** —— 落到首页那一刻**不再算走完**：那之后还有
       「等 1 秒弹『会员购买页 · 新』→ 点 x 必弹优惠券挽留」这一轮，要把它走完（用户退出购买页、
       回到首页）才真的关（见 state.firstLaunchTail / finishFirstLaunch）。
       只在页面内存、不落库（设备权限本身也不落库）。 */
    firstLaunch:false,
    /* 首启尾巴（2026-10-06 再晚些需求，内存不落库）：落到首页那一刻紧接着排了「打开 App 自动弹
       会员购买页」（launchPaywall 排下那 1 秒定时器）就挂上这枚标记 —— 意味着首启还剩最后一环
       没走完，期间 clearFirstLaunch **什么都不做**（开关继续亮着），等这一轮收场由 finishFirstLaunch
       一并关掉。真收尾两个时机：① 离开「会员购买页 · 新」（openAppScreen / returnKeyboard）；
       ② 那一秒里用户已经不在首页、这次弹出被放弃（launchPaywall）。 */
    firstLaunchTail:false,
    /* firstLaunchOffer =「**本次启动走的是首启引导链路**」的标记（2026-10-06 需求，内存不落库）：
       由 clearFirstLaunch() 在**落首页那一刻**顺手翻上 —— 开关 firstLaunch 此刻已经关掉，而首启
       链路里弹付费墙（launchPaywall）恰恰是落首页 1 秒之后的事，所以「首启引导必弹「永久会员
       立减优惠」挽留弹窗」这条判定要看它（见 leavePurchasePage）；重开一轮首启由 firstLaunchReset
       复位成 false（这一轮首启彻底走完时由 finishFirstLaunch 一并复位）。 */
    firstLaunchOffer:false,
    /* kbEnabled = 左栏「设备权限」的「开启键盘」开关：关闭时键盘整块换成占位（宿主 App 用系统键盘）；
       主 App 的状态检查链里它是第一环（没启用整页进「开启键盘」引导，见 appEntryGuards）；
       keyboard = 「键盘完全访问」开关：键盘被唤起时先看它 —— 没开就从下往上弹「完全访问引导页」
       （kb-full-access，Android 默认开启、不弹），主 App 里它是状态检查链的第二环
       （键盘权限通过后再查它，见 appEntryGuards），另外仍是 generate() 的拦截判定；
       它也挂在这颗「开启键盘」下面：键盘关掉即一并复位成关（完全访问是键盘的权限 ——
       左栏 change 与系统设置页那颗同名开关同一套联动，见 toggleGuideEnable），photos 三档 denied / limited / full ——
       消费方是键盘选择器（kb-photo-picker）：完整访问 = 正常网格，有限访问 = 顶部引导条 +
       只有授权过的那张可读，关闭 = 整块换成权限引导页；
       cellular = 「蜂窝网络」开关（开 = 视为已插卡且有蜂窝网络）—— 只有一个消费方：
       未登录时键盘内弹哪张登录页（一键登录 / 手机号验证登录，见 kbLoginMode）；
       ime = 「当前输入法」（'system' 系统默认输入法 / 'loveco' LoveCo 输入法，默认前者）——
       安卓引导页第二步的判定项：安卓系统不允许 App 直接切换输入法，键盘启用后还要用户在系统里
       把当前输入法切成 LoveCo（见 appGuideHome / guideSatisfied）；与「开启键盘」强绑定 ——
       选 LoveCo 必然已启用键盘（动作里顺带打开），关掉键盘则复位成系统默认 */
    /* 三个可见开关**默认都是开的**（2026-10-06 需求改；此前 2026-09-28 起默认都是关）：蜂窝网络 /
       开启键盘 / 键盘完全访问 —— 启动即一台已启用键盘、已授完全访问、有蜂窝网络的设备，三处引导
       （键盘引导 / 完全访问引导 / 登录页形态）都改由左栏开关或页面列表现场摆出来看；未登录启动时
       键盘被唤起仍先弹登录层、主 App 落首页前仍弹登录层（「模拟 › 登录状态」还是默认关）；
       network 与 microphone 没有 UI 入口，是拦截判定（手改验证），保持默认开启；
       相册访问权限仍默认「关闭」（2026-09-29 需求）—— 键盘里点相册图标走「相册权限引导页」那条形态；
       要看新机从零引导的整条链路，开左栏「模拟 › 首启引导」（firstLaunchReset 摆回新机）；
       platform 为 android 时键盘完全访问本来就默认开启、不弹那一层（needsFullAccess） */
    permissions:{network:true,cellular:true,kbEnabled:true,keyboard:true,photos:'denied',microphone:true,ime:'system'},
    modal:null, modalData:{}, modalBack:null, partnerPanel:false, settingsPanel:false, photoPanel:false,
    /* 新增 / 编辑聊天对象面板（kb-partner-editor）：键盘模式下替代弹层；
       photoMode 记录选择器是聊天截图模式（chat）还是头像模式（avatar，单选、底部「确定」）；
       photoBack 记选择器是从哪一层进来的（'kb-editor' = 对象编辑面板），关闭 / 确定时好弹回去。
       键盘区域同时只留一层覆盖层 —— 开选图选择器 / 管理页前先收起编辑面板（见 dismissKbEditor），
       否则编辑面板渲染在最后会把新开的层盖住；
       键盘设置页是例外：编辑面板打开时它只覆盖下半键盘区域、面板留在上半（见 theme.css），
       两者上下分区、互不重叠，所以不收起面板。 */
    kbEditor:false, photoMode:'chat', photoBack:'',
    /* 对象编辑面板打开时，键区打字的目标改成面板里的「备注名」输入框（而不是宿主会话输入框）：
       已确认文字存在 modalData.name，未确认的组合串仍是 state.composition；
       partnerCaret 是这个输入框的光标锚点（null = 贴末尾，见 targetCaret / partnerNameDisplay）。 */
    partnerCaret:null,
    /* 问AI 页（kb-free-chat 组件）：键盘菜单栏相册（图片）图标左侧的气泡按钮进入的
       「与 AI 对话」页面 —— 键盘顶部换成「问AI」标题栏 + 提问输入行，键区照常在下：
       标题栏顶替菜单栏（同高），整块键盘按输入区（缩略图行 / 快捷栏 / 输入行）的实际高度往上长，
       键区高度不变（见 theme.css 的 .keyboard.free-chat 与 paintFreeInputGrowth）。
       freeChat 是这一页的开关（键盘底座上的一层，不是覆盖层）；
       freeText / freeCaret 是提问输入框（#free-chat）的内容与光标锚点 —— 与对象编辑面板的
       备注名同一套机制：这一页打开时键区打字就落在这个框里（见 typingInFree / targetValue）；
       发送（键区右下角那颗蓝键、选择器展开时输入行右端的蓝色按钮）把这句话连同已选截图
       一起交给 AI（过渡页 → 生成中 → 聊天分析 / AI通用回复，见 sendFreeChat），
       发送后这一页收起、输入清空 —— 结果统一由聊天分析面板承接。
       它不是弹层：跳页面 / 收起键盘（kbReset）时随其它键盘状态一并收起，输入内容留在 freeText 里
       （与宿主输入框草稿同理，收起的是键盘，不是用户打的字；发送成功才清空）。 */
    freeChat:false, freeText:'', freeCaret:0,
    /* 问AI 页里的图片选择器（kb-photo-picker 的**内嵌形态**，不是整页的「选择聊天截图」）：
       点提问输入行右端的图片按钮 / 缩略图行的「+」展开 —— 输入行**下方**的整块键区（键体 + 平台
       底栏）换成三列截图网格，从底部往上滑出、超出可滚动；点输入框即收起、回到键盘页。
       已选图片记在 state.selectedPhotos：网格里的序号、输入框上方的缩略图行读的是同一份，
       最多 3 张（相册权限两档引导照旧生效）。 */
    freePicker:false,
    /* 快捷栏（输入框上方那一行预设问题）刚点下的那一条：FREE_SHORTCUTS 里的 id 或 ''。
       这一栏**常驻**（2026-10-06 晚些需求，见 kb-free-chat.js），**点一下立即发送**
       （pickFreeShortcut），所以它只在发送那一刻有用 ——
       决定这次的**结果结构**：「帮我回」→ 聊天分析（关系简报 + 三组建议）；
       其余 / 空 → AI通用回复（见 sendFreeChat / makeOutcome）。 */
    freeShortcut:'',
    /* —— 主 App「AI 咨询师」页（app-ai / appAiPage，2026-10-06 需求；同日晚些需求
       页面列表条目由「问AI（AI 咨询师）」改名「AI 咨询师」）——
       与「AI 咨询师」的聊天整页：顶部菜单栏（历史抽屉 / 标题 / 新对话 / 关闭）+ 上半聊天记录
       + 下半与键盘「问AI」页一致的键盘（同一块 kb-free-chat + 键区，读同一份 freeChat /
       freeText / selectedPhotos）。aiThreads 是会话列表（每条 {id,title,msgs}，msgs 为聊天
       记录），aiThread 是当前会话 id；两者都只在页面内存里、不落库 —— 刷新即回到内置的
       演示会话（seedAppAi）。aiHistoryOpen 是历史抽屉（左侧滑出）的开关；
       aiBusy 是「AI 正在输入」标记（发送后约 1.1 秒内不再接受下一次发送）；
       aiSeq 是会话 id 的自增序号。
       aaiKb / aaiSheet 是这一页底部区的两个开关（2026-10-06 晚些需求：点输入框调出
       「当前键盘」、点图片 / 头像从底部弹出 2 行图片高度的窗口）：aaiKb = 调出的键盘在屏，
       aaiSheet = 底部弹窗（'photo' 截图网格 / 'partner' 对象列表）；两者互斥 —— 开弹窗先收键盘。
       上一版「键盘开启就常驻」的形态作废（下半不再读 permissions.kbEnabled 决定常驻与否，
       改由 aaiKb 决定，见 appAiPage / aiKeyboardArea）。 */
    aiThreads:[], aiThread:'', aiHistoryOpen:false, aiBusy:false, aiSeq:0,
    aaiKb:false, aaiSheet:'',
    /* 键盘选择器 / 聊天分析面板的一次性入场标记：置 true 后 render 一次即清掉。
       只有这次渲染的面板带 .entering 播放从下往上的弹出动画，
       之后其它操作的重渲染（DOM 重建）不带 .entering，不再重放动画。 */
    pickerEnter:false,
    /* 键盘整页覆盖层（聊天对象管理页 / 键盘设置页）的一次性入场标记，机制同 pickerEnter：
       动画只播打开那一次 —— 删除对象等仿真请求触发的重渲染不再重放（否则整页闪一下）。 */
    panelEnter:false,
    /* 「AI 分析」过渡动画页（kb-scan）：点「立即分析」先播约 1 秒的截图逐张点亮动画，
       播完由 finishScan() 原地切到聊天分析面板。scanStartedAt 让组件把动画对齐到已播进度
       （过渡期间的请求会触发整页重渲染，不校准会跳回起点重扫）。 */
    scanPanel:false, scanTimer:null, scanStartedAt:0,
    /* —— 「模拟截屏」（左栏「模拟」的按钮 / 仿真控制台的同名按钮，**两处都只在键盘形态**
       2026-10-06 需求 —— 主 App 形态的「模拟」组不再有这一行）：仿真按一下系统截屏键 ——
       把宿主会话最近三条消息画成一张聊天截图插进相册（samples 最前），手机整屏白闪一下；
       接着按键盘此刻**是否激活**分两条路（见 takeScreenshot）：
       ① 键盘激活（在屏且可用）= 键盘能感知到这次截屏 —— 不用点相册图标再选图，
          直接进「AI 分析」过渡动画页，之后的链路与「立即分析」完全一致；
       ② 键盘收起 / 不在屏 = 键盘感知不到 —— 截图先躺在相册里，id 记进 pendingShot；
          等键盘被唤起、且完全访问权限 / 登录 / 「完整的相册访问权限」三关都过了，
          菜单栏的相册图标才就地换成这张截图的缩略图并持续放大缩小（见 pendingShotItem），
          点它同样直接进 AI 分析过渡页。再截一张以最新那张为准（同一时刻只提示一张）。
       shotFlash 是整屏白闪的标记（约 0.35s 后由 shotFlashTimer 摘掉），
       pendingShot / 截图 / 白闪都只在页面内存里，不持久化。 */
    pendingShot:'', shotFlash:0, shotFlashTimer:null,
    /* 启动缺省形态 = 主 App（2026-10-04 需求；原来是 keyboard），`?surface=keyboard` 进键盘形态 */
    appView:surfaceParam || 'app', appScreen:null,
    /* 「打开 App 自动弹会员购买页」的本次启动标记（state.launchPaywallShown，2026-10-06 需求，
       见 launchPaywall）：false = 本次启动还没弹过 —— 打开 App 落到首页那一刻未开通会员
       （!state.member）就先弹「会员购买页 · 新」；弹过或已是会员即翻成 true，关掉弹层后
       再回首页也不会重复弹。只存内存、**不落库**：刷新页面 = 又打开一次 App，重新计一次。
       **2026-10-06 本轮需求：改成「落到首页后等 1 秒再从底部弹出」** —— launchPaywallTimer 是
       那一秒的定时器句柄（用来在「模拟 › 首启引导」把设备摆回新机时把待弹的定时器撤掉）；
       launchPaywallShown 在**排定时器那一刻**就翻成 true（不是弹出那一刻），所以这一秒里
       再走别的链路也不会重复排。 */
    launchPaywallShown:false, launchPaywallTimer:null,
    /* 「会员购买页 · 新」的两个一次性标记（2026-10-06 本轮需求，落地见 launchPaywall /
       leavePurchasePage）：pu2Enter = 打开这一次渲染时挂 `.entering`（配合 styles.css 的
       `.pu2-page.entering` 整页从底部滑入，动画只播一遍 —— 渲染完立刻复位，下次重渲染不带）；
       pu2Launch = 这一页是**自动弹出**的（不是「我的」页会员卡片 / 额度不足 / 键盘跳转那些手动
             入口进来的），只用来判**出口退回哪儿**：点叉号 / Esc 时回首页（手动进本页的回「我的」）；
             2026-10-06 需求起它也参与挽留弹窗的触发判定 —— 首启引导（state.firstLaunch）里弹出的
             这一页**必弹**挽留弹窗，其余情况才走 1/4 随机（见 leavePurchasePage）。 */
    pu2Enter:false, pu2Launch:false,
    /* 「消息」未读态（2026-10-06 需求）：首页右上角信封图标右上角那枚**小红点**的开关 ——
       true = 有未读消息（默认值；对应「消息」页里那条还没看过的续费提醒），
       点信封进「消息」页即置为已读（见 home-msg 动作），返回首页红点就不再显示。
       页面内存、不落库 —— 刷新页面回到「有未读」的初始态，想再看红点刷新即可。 */
    msgUnread:true,
    /* 页面列表分组的展开集合：空 = 全部默认折叠（见 pageList），点组名才把该组加进来。
       只存「展开的组」，新增分组无需额外登记即自动落到默认折叠态。页面内存、不持久化。 */
    pageExpanded:{},
    /* 键盘收起态：点宿主聊天区域（消息区 / 会话头部，不含输入栏）即收走整块键盘 ——
       键盘的任何状态与页面（菜单栏 / 候选词栏、对象管理页 / 设置页、选图 / 扫描 / 分析面板、
       对象编辑面板）一并清场，手机里只剩宿主会话；再点宿主输入框才重新弹出（见 expandKeyboard）。
       收起 / 弹出都不动宿主输入框草稿（state.host）与会话消息 —— 收起的是键盘，不是用户打的字。
       不持久化：刷新页面回到「键盘常驻」的默认形态；切主 App / 返回键盘时由 returnKeyboard() 复位。 */
    kbCollapsed:false,
    /* 键盘使用引导（kb-usage-guide 组件）：整机覆盖的**纯演示层**（假页面）——'' 不显示，
       其余是引导进行到哪一步（shot / flash / composer / kb / thumb / scan / stream /
       pick / send / win，十步的说明见组件头注释）。gxTyped 是打字机已输出的字数
       （组件按它截断重绘、gxTyping() 从原地继续推进）；gxTimer 给步骤之间的过渡
       （白闪 / 键盘弹起 / 分析动画 / 选回复），gxStreamTimer 是「输出完 → 选回复」的
       半拍停顿（防重入）。只在页面内存、不持久化；主 App 与键盘两种形态的整机都挂这层
       （点入不切 App形态），Esc 直接收场回当前形态的原页。
       gxFromGuide 记「这一次是不是引导链路最后开演的」—— 引导第二步切完键盘后先走
       登录 → 资料引导（2026-10-08 需求把演示挪到链路最后，见 guideAfterSwitch / guideToDemo），
       都走完才开演；是的话收场即完成引导（落首页 + 排「等 1 秒弹会员购买页」，见 closeKbUsageGuide），
       不再回到之前那一页。 */
    kbGuideDemo:'', gxTyped:0, gxTimer:null, gxStreamTimer:null, gxFromGuide:false,
    /* 引导链路的「演示待演」标记（2026-10-08 需求改了引导收尾的顺序）：
       引导第二步（在系统里把当前键盘切成 LoveCo）完成时置上 —— 之后先补完状态检查链的后两环
       （完全访问 → 登录）、再走资料引导（性别 / 出生日期），**最后**才是「键盘使用引导（演示）」；
       演示收场（closeKbUsageGuide / gxAdvance 的 win 步）才算完成引导：落首页 + 等 1 秒弹会员购买页
       （见 guideAfterSwitch / guideToDemo / finishGuide）。跨登录页 / 资料引导两站存活，
       供 finishKbLogin / finishOnboarding 判断要不要接着开演；中途退出登录（closeAppLogin）、
       收掉演示层（closeKbUsageGuideSilent）、切回键盘形态（returnKeyboard）、重开首启
       （firstLaunchReset）等「离开这次引导」的出口一律清掉。页面内存、不落库。 */
    guideDemoPending:false,
    /* 键盘内登录层（kb-login 组件）：键盘模式下未登录时，键盘一被唤起就弹出、覆盖整个键盘区域 ——
       kbLogin 记当前形态（'' = 不显示 / 'one-tap' 本机号一键登录 / 'sms' 手机号验证登录 /
       'done' 登录成功的提示，约 1 秒后自动收起），形态缺省按「设备权限 › 蜂窝网络」
       （permissions.cellular）二选一，见 kbLoginMode()；
       kbLoginPhone / kbLoginCode 是短信形态两张输入框的值（bind() 实时回存，重渲染不丢），
       kbLoginSent 记验证码已发送（按钮改「重新获取」）、kbLoginBusy 是发码请求在飞、
       kbLoginConsent 是一键登录的协议勾选（主 App 的两张登录页每次进页 / 页间互跳都清回未勾选 ——
       2026-09-29 需求「手机号页面默认不勾选协议」，见 openAppLogin / kb-login-sms；
       键盘形态仍共用同一份、就地换表单保留勾选）、kbLoginTimer 是成功提示的收起定时器。
       appLoginReturn 记主 App 登录页的来路页（2026-09-29 起主 App 的登录是 appScreen='login' /
       'login-one-tap' 的独立页面，X / Esc 关掉、登录成功收尾都回到来路那一页；键盘形态不用它）。
       kbConsentAsk 是主 App 登录页上「请阅读并同意以下条款」弹框的开关（未勾选协议就点主按钮时弹，
       键盘形态仍是抖协议行、不用它）、kbConsentNext 记这次被拦下的是哪个动作，点「同意并继续」
       时接着跑它（见 askKbConsent / kb-consent-agree）。
       appLoginDelayTimer 记「未登录点『我的』Tab」那一次的延迟弹登录页定时器（2026-10-04 需求：
       先进「我的」页、0.5 秒后才按蜂窝网络开关弹「一键登录」/「手机号登录」页；到点时页面切走了 /
       已经登录上就作废，见 app-tab 动作与 openAppLogin 里的 clearTimeout）。
       除恒常驻的启动态外，都是打开时重置。 */
       kbLogin:'', kbLoginPhone:'', kbLoginCode:'', kbLoginSent:false, kbLoginBusy:false, kbLoginConsent:false, kbLoginTimer:null, appLoginReturn:'', kbConsentAsk:false, kbConsentNext:'', appLoginDelayTimer:null,
    /* 键盘内协议正文页（kb-legal 组件）：登录层协议行里点协议名打开 —— 把该协议全文缩到键盘
       这一条高度里滚动浏览（正文取 legal-data.js 同一份快照，见 kbLegalDoc）。
       kbLegal 记当前协议 key（'' = 不显示 / 'terms' 用户协议 / 'privacy' 隐私协议 /
       'carrier' 中国联通认证服务协议）；kbLegalEnter 是这一层「从下往上弹出」的一次性标记
       （单独一个，不复用 pickerEnter —— 免得连带把底下的登录层一起重播滑入动画）。
       它只是压在最上面的一页正文：X / Esc 关掉即回登录层、协议勾选状态不动；
       关闭登录层 / kbReset 时随登录层一并收起。
       **这一层现在只有键盘形态用**：主 App 里协议名（两张登录页的勾选行 / 协议弹框、购买页的
       协议行）2026-10-04 需求起改走**协议正文整页**（appScreen='legal'，见 openAppLegal /
       下面的 legalFrom），kb-legal 动作在 app 形态下直接转过去。 */
    kbLegal:'', kbLegalEnter:false,
    /* 键盘完全访问引导层（kb-full-access 组件）：键盘被唤起时的第一道检查 —— 键盘侧没有完全访问权限
       （iOS 叫「允许完全访问」、鸿蒙叫「完整访问」，Android 系统上默认开启）就弹出这一层，
       「去开启」仿真开启后才轮到登录检查（见 checkKbEntry）。主 App 里它同样是状态检查链的一环
       （键盘权限通过后再查它，见 appEntryGuards），渲染在 .app-shell 上、铺满正文区（组件按形态
       不渲染键盘底栏，见 kb-full-access.js）。kbFullAccess 只是这层覆盖层的开关（与 kbLogin 互斥），
       不持久化。 */
    kbFullAccess:false,
    /* 主 App 协议正文页（appScreen='legal'，2026-10-04 需求）：
       协议正文 2026-09-26 曾从独立页面降级成**浮在页面上的 sheet 覆盖层**（state.appLegal），
       2026-10-04 按设计图改回**整页**（页头只有一枚返回箭头、且常驻顶部不随正文滚动消失，
       见 appLegalPage）—— 覆盖层的开关字段 state.appLegal 随之删除。state.legalKey 是当前
       正在看的协议（legal-data.js 的键，如 terms / privacy / cancel），legalFrom 记来路页
       （「我的」/ 注销页 / 登录页 / 购买页），返回箭头与 Esc 都回它。
       （「关于 LoveCo」页 2026-10-06 需求已删掉「隐私与协议」卡片，不再是来路之一。）
       同日稍晚原「协议中心」列表页（appScreen='legal-list'）按需求删除，勿再补回。 */
    legalFrom:'',
    /* 开启键盘引导（state.kbGuidePage）：进入主 App 时键盘未开启（!permissions.kbEnabled）就走这条链，
       主 App 不落首页、整页进入引导流程 —— 'guide' 引导页（演示视频 + 一至两颗按钮：鸿蒙 / iOS
       一颗，安卓两颗，见 appGuideHome）/ 'settings' 模拟鸿蒙「输入法」设置页 / 'detail' LoveCo
       输入法详情页（两个开关）。详情页两颗开关都直接绑设备权限（同一台设备的同一个开关）：
       第一个「启用LoveCo」绑 permissions.kbEnabled（开了它左栏「开启键盘」同步打开，键盘就算开启了）；
       第二个「完整体验模式」绑 permissions.keyboard —— 鸿蒙系统里完全访问这个权限就叫这个名字，
       开它左栏「键盘完全访问」同步打开（2026-09-28 需求，此前是另存的 kbGuideFull，两处不联动）。
       引导完成的条件按平台两分（见 guideSatisfied）：键盘已启用；
       安卓还要「当前输入法」已是 LoveCo（permissions.ime，左栏「平台与app形态」里可切）。
       页面内存、不持久化；完成引导 / 离开主 App 都清空。 */
    kbGuidePage:'',
    /* 键盘切换悬浮窗（ieSwitchSheet，2026-09-28 按设计截图补入；只有安卓引导流程会开它）：
       仿真「点键盘上的切换输入法按钮」弹出的系统输入法选择器 —— 只列 LoveCo 与讯飞输入法两个。
       打开时机两处：① 安卓引导页点「第二步 切换到LoveCo输入法」；② 从模拟设置页退回引导页
       且键盘已启用（真实设备上 App 也只能在回到前台时才知道键盘开了，见 guideBack）——
       选一行即切换当前输入法（permissions.ime）并收起本层。页面内存、不持久化。 */
    kbImeSwitch:false,
    /* 「切换到 LoveCo 键盘」页（kbGuidePage='switch'，2026-09-28 按设计截图补入）：
       iOS / 鸿蒙引导的**第二步** —— 键盘已启用、但当前键盘还不是 LoveCo 时，主 App 落这一页
       教用户长按地球把键盘切过来（安卓的第二步是键盘切换悬浮窗，不走这一页）。
       这一页只演「切换前」这一刻：底下那块「当前正在使用的键盘」固定是**系统英文键盘**
       （2026-09-29 需求：原来的「已切到 LoveCo」形态 —— 切过去后就地换成 LoveCo 键盘预览
       + 「完成」胶囊 —— 已删除）。
       kbSwitchPicker 是长按地球弹出的**键盘选择器**（更多键盘设置… / LoveCo / 英文键盘）的开关；
       在里面选 LoveCo = 第二步达成：不就地换形态，接着走引导的后半段（2026-10-08 需求把演示
       挪到链路最后：先补状态检查链后两环 → 资料引导 → 最后才是「键盘使用引导（演示）」，
       演示收场才完成引导）——（落到 permissions.ime —— 与左栏「平台与app形态 › 当前输入法」
       同一个状态，不另存一份；见 pickKbSwitch / guideAfterSwitch / openKbUsageGuide）。
       页面内存、不持久化；换页 / 完成引导 / 跳页面列表都会收起。 */
    kbSwitchPicker:false,
    /* 会员开通覆盖层（kb-paywall 组件，主 App 与键盘形态共用同一层）：kbPaywall 是这层覆盖层的
       开关，kbPlan 是它选中的档位（默认永久会员）。商品只有一张表（PLANS，见下）——
       原「键盘内 / 主 App 各一套商品、靠 planSource 分流」的做法已随主 App 会员页删除作废。 */
    kbPaywall:false, kbPlan:'permanent',
    /* 会员购买页 · 支付渠道（purchasePay，2026-09-29 三次需求）：安卓 / 鸿蒙那一行**首选支付宝**、
       点一下切到微信支付、再点切回来（'alipay' | 'wechat'，只存内存不落库 —— 每次进页都回到首选
       支付宝）。**2026-10-06 起只有「会员购买页 · 新」purchase2-copy 用这一份渠道态** ——
       第一个购买页 purchase 与第二个 purchase2 同日已按需求整页删除（勿再补回），
       「会员购买页 · 新」的支付方式行与协议确认框读它。
       iOS 不摆这一行内容（Apple 内购走系统支付框 —— 2026-09-29 五次需求），这个字段仍然
       只在安卓 / 鸿蒙参与渲染（渠道切换动作只在安卓 / 鸿蒙可触发）；**2026-10-06 需求**：
       iOS 上这一行改由 CSS 置成不可见占位（不再是不渲染 —— 见 appPurchasePlusCopyPage
       函数头注释与 theme.css 的 .phone[data-platform="ios"] .pu2-page 两条）。 */
    purchasePay:'alipay',
    /* 「会员购买页 · 新」（appPurchasePlusCopyPage，2026-10-06 新增，appScreen='purchase2-copy'；
       **2026-10-06 晚些需求本页由「会员购买页 · 新2」改回「会员购买页 · 新」这个名字**；
       同日第二个购买页 purchase2 与第一个购买页 purchase 都按需求整页删除，本页成了主 App
       **唯一的会员购买页** ——「我的」会员卡片与「会员中心」行、额度不足、键盘安卓 / 鸿蒙跳转
       四处入口都落它，见 gotoAppPurchase / generate / action 的 app-membership 分支）
       自己的选中态 —— 与键盘会员开通层（PLANS + state.kbPlan）各自独立：
       pu2Plan 是选中的档位（PLUS_PLANS 的键，**默认永久会员**，2026-10-06 晚些需求：原默认季度），
       pu2Agreed 是协议行那枚圆形勾选框的勾选态（未勾选时点「立即解锁」不直接支付、先弹协议
       确认框，确认即勾上并立即调起支付 —— 2026-10-06 晚些需求，原「购买不前置勾选」口径在本页
       已被这条链路取代）；
       pu2Ask 是**协议确认框**（pu2AskSheet）的开关，2026-10-06 晚些需求新增：
       ① 未勾选协议点「立即解锁」（p2-buy）先弹框；② **切换档位卡**（p2-plan，点了不同档才算切换）
       直接弹框 —— 点「同意」= 勾上协议 + 立即按当前档调起支付（iOS 弹 iOS 系统支付框 /
       安卓·鸿蒙一键到账），点「取消」/ Esc 只收框。三者都是页面内存、不落库，
       每次进页由 openAppScreen 摆回默认（永久会员 / 未勾选 / 确认框收起）；
       支付渠道复用上面的 state.purchasePay（进页回首选支付宝）。 */
    pu2Plan:'permanent', pu2Agreed:false, pu2Ask:false,
    /* 「兑换码」**半屏底部弹层**（state.redeemSheet，2026-10-06 需求，页见 redeemSheet()；
       入口 = 「会员购买页 · 新」底部那枚「兑换码」白胶囊 p2-redeem —— 原「即将开放」轻提示作废）：
       弹层从手机底部滑上来、高半屏（屏幕的 50%；骨架 .rd-* 在 styles.css、皮肤在 theme.css）——
       输入兑换码 → 校验（REDEEM_ERRORS 一套提示）→ 会员天数当场到账（grantRedeemDays）
       → 卡内切成功态。redeemDraft / redeemError / redeemDone 依次是输入草稿、校验提示、成功态
       （{days}，null = 未成功）；redeemEnter 只在打开那一次渲染挂 .entering（滑入动画只播一遍，
       提交后切成功态不再重播）；redeemUsed 是已用过的兑换码（**落库** —— 每个码只能兑一次，
       演示码见 REDEEM_CODES；除 redeemUsed 外都是页面内存、不落库）。 */
    redeemSheet:false, redeemDraft:'', redeemError:'', redeemDone:null, redeemEnter:false,
    redeemUsed: Array.isArray(saved.redeemUsed) ? saved.redeemUsed : [],
    /* 「永久会员立减优惠」挽留弹窗（state.pu2Offer，2026-10-06 需求，页见 pu2OfferSheet()）：
       入口 = 「会员购买页 · 新」的出口（左上角圆形叉号 p2-close 与 Esc 同一条）——
       点它不退出页面、改弹这一层挽留（照用户参考图设计：浅紫渐变卡 +
       标题 + 权益四条 + 左红块「永久会员 / 立减优惠」+ 右米块「立减 ¥40」+ 紫粉渐变
       「领取优惠」，本页另加一行 **3 分钟倒计时**）；**页面列表另登记了它的形态条目
       「会员购买 · 优惠券」`purchase2-offer`**（同日晚些需求：这一层是「会员购买页 · 新」
       的第二种形态，点入即摆出这一形态、不落库，见 setupPage）。
       **什么时候弹（2026-10-06 同日再改，原口径是「每天第一次必弹」）**：**首启引导必弹**
       （state.firstLaunch = 左栏「模拟 › 首启引导」那条链路，连首页自动弹出的付费墙那一次
       也照弹）；**其余情况随机 1/4 命中才弹**（OFFER_POP_RATE）；**当天已弹过一律不弹**，
       第二天自然恢复（日期比对，跨天即重置）。
       pu2Offer 是弹窗开关（内存）；pu2OfferLeft 是倒计时剩余秒数（内存，3 分钟 = 180，
       归零自动收层、优惠作废）；pu2OfferTimer 是每秒走一格的定时器（只改倒计时那枚数字、
       不整页重渲染，任何出口都停表）；
       offerDate 记「上次弹窗是哪一天」（'YYYY-MM-DD'，**落库**）—— 当天已弹过就不再弹
       （与「每天第一次打开 App」同一条口径：按本机自然日算）；
       offerClaimed 是「已领取优惠」（**落库**）—— **与 offerDate 同一天时**永久档按
       立减 40 后的 128 显示（见 offerActive / OFFER_SAVE / appPurchasePlusCopyPage），
       跨天自动失效、当天点 x 又能再领一次。 */
    pu2Offer:false, pu2OfferLeft:180, pu2OfferTimer:null,
    offerDate: saved.offerDate || '', offerClaimed: saved.offerClaimed === true,
    /* 首页「限时特惠」**悬浮卡**（state.offerBadge，2026-10-06 需求，页见 offerBadge()）：
       「永久会员立减优惠」挽留弹窗被放弃（弹窗右上角 x / Esc，见 leaveOfferSheet）后，
       **优惠资格再保留 3 分钟** —— 回到首页就浮出这颗卡（回「我的」那一次也照样起跳，
       等切回首页才显形）。点它 = 直接调起支付（payFromOfferBadge），拖它 = 自己挪位置。
       offerBadge 是这颗卡的开关（内存）；offerBadgeEnds 是到期时刻（时间戳，内存）；
       offerBadgeTimer 是那枚毫秒倒计时的定时器（只改卡上那一串数字、不整页重渲染）；
       offerBadgePos 是拖过之后的位置（{x,y}，相对手机左上角的 px；null = 默认贴右下，
       只在松手时记一次、不落库 —— 刷新回默认位）。
       归零 = 整枚卡自动消失、优惠资格到此作废（当天再进购买页仍能再领一次）。 */
    offerBadge:false, offerBadgeEnds:0, offerBadgeTimer:null, offerBadgePos:null,
    /* iOS 系统支付框（state.iosPaySheet，ios-pay-sheet 组件）：iOS 上点会员开通层的「立即解锁」
       就地弹出的 App Store 内购确认弹窗（系统级、铺满整机）—— 只在 iOS 出现；取消 / 支付成功 /
       切形态 / 换页都会收起。开着时 Esc 与它自己的 X 同一条出口（试付进行中不可关）。 */
    iosPaySheet:false,
    paymentBusy:false,
    /* 按住说话（state.voiceHold）：{cancel, y0, pid, source} —— source 记按住的是哪个入口
       （'panel' 聊天分析面板的麦克风 / 'composer' 输入栏语音圆钮与框内麦克风 / 'dictation' iOS 底栏）。
       松手去向两分：面板麦克风，或面板正停在已完成态（「聊天分析 · 已完成」/「AI通用回复」两页，
       见 chatPanelDone）—— 转写文本是**给 AI 的一句新指令**，作为本次输入重新生成
       （过渡页 → 生成中 → AI通用回复，见 submitPanelVoice）；其余时候写进宿主输入框；
       voiceQuery 是语音追问那一档话术（只有一档：文案与结果结构都按它来；原「模拟 › 语音指令」
       下拉 2026-10-06 已删除、UI 不再能切档），
       见 VOICE_QUERIES / makeOutcome），与真实产品一致的是「AI 按用户说了什么决定结果长什么样」。 */
    voiceHold:null, voiceQuery:'review', legalKey:'terms',
    requestSeq:0,
    accountEpoch:0, gender:saved.gender||'暂不设置', age:saved.age||'暂不设置', mutationBusy:false, formCache:{},
    /* 用户 ID（「用户」页第一张卡片那一行，2026-10-04 需求；行标签原为「会员 ID」，
       同日按反馈改「用户 ID」并去掉行尾折角箭头 —— 展示值仍叫 memberId）：
       跟着存档走的展示值（默认 7297034，与设计图一致），右侧一枚复制图标把值写进剪贴板；
       memberIdCopied 是复制后图标变勾的那一下（约 1.2 秒后由 memberIdTimer 复位）。 */
    memberId:saved.memberId||'7297034', memberIdCopied:false, memberIdTimer:null,
    /* 首次登录后的「资料引导」（2026-09-28 需求，见 appOnboardPage）：登录成功收起登录层那一刻
       —— **只要性别还没设置** —— 接着走两步：① **选择性别**（**不可跳过**）→ ② **你的出生日期**
       （可跳过），走完（或跳过第 ② 步）才进主 App 首页，之后登录不再出现。
       「性别有没有设置」由左栏「模拟 › 已设置性别」仿真开关表示（genderSet，**关 = 还没设置**、落库；
       **仅主 App 形态渲染**这一行 —— 2026-09-29 需求，键盘形态左栏与「仿真控制台」弹层不再显示，
       状态本身照常随形态共享）—— 2026-10-06 由「首次登录App」改名而来（语义反过来：原来那颗
       开 = 算首次登录，现在这颗开 = 性别已设置好）：
         · 关 = 还没设置性别 → 登录成功先走资料引导（第一步性别**不可跳过**），走完把开关置成开；
         · 开 = 性别已设置 → 登录成功直接回原处，不再出现这两页。想再看一遍就手动关掉它。
       **「首启引导」开着时无条件走这两页**（state.firstLaunch，见 finishKbLogin）：刚装上的 App 第一次
       登录必然要设性别 / 生日，哪怕这颗开关已经是开的；反过来，首启中途（性别页上）主动退出 App、
       首启没走完时开关仍留在关着 —— **下次登录照着它再检查一次性别**，没设置就把这两页再弹出来。
       birthday 是 'YYYY-MM-DD'（跳过则留空，落库；「用户」页的出生日期行随之对上）；
       onboarding 是当前停在第几步（'' / 'gender' / 'birthday'）、onboardPick 是出生日期那一步
       滚轮上停着的年月日 —— 两者都是页面内存，不落库。 */
    birthday:saved.birthday||'',
    /* 老存档迁移：改名前的 firstLogin 语义相反（false = 资料引导已走完 = 性别已设置）；
       两个键都没有时就看 gender 本身有没有值 */
    genderSet:saved.genderSet!==undefined ? !!saved.genderSet
      : (saved.firstLogin===false || saved.gender==='男' || saved.gender==='女'), onboarding:'', onboardPick:{y:2006,m:9,d:28},
    /* 「用户」页（原「个人资料」，2026-10-04 按设计图重做）两处编辑的**就地弹层**：
       '' 不显示 / 'gender' 性别二选（只在还没设置过时开得起来）/ 'birthday' 出生日期滚轮；
       userPick 是出生日期滚轮停着的年月日（弹层草稿，打开时按当前生日初始化）。
       都是页面内存、不落库 —— 换页 / Esc / 保存后收起（见 renderApp 挂点与 userSheet()）；
       原 'nickname' 改名弹层随昵称行于 2026-10-04 一并删除。 */
    userSheet:'', userPick:{y:2006,m:9,d:28},
    /* 「注销账号」链路（2026-10-04 需求，见 appCancelPage / cancelAskSheet）：
       cancelAsk 是注销页上「注销申请成功」弹框的开关（点「确认注销」弹框、
       点「知道了」回首页，Esc 只收弹框）；注销页是独立整页（appScreen='cancel-account'、
       无底部 Tab），从「用户」页第三张卡的「注销账号」行进。都是页面内存、不落库。 */
    cancelAsk:false,
    /* 「我的」·「支持」·「联系客服」的弹层（2026-10-04 需求，见 supportSheet()）：
       supportSheet 是弹层开关（点那一行弹出，X / Esc / 换页都收起，**点邮箱那行复制完也收起**）。
       都是页面内存、不落库。
       原 supportCopied（复制后图标变勾约 1.2 秒再复原）随 2026-10-04 晚些「复制完就关弹层」
       的需求一并删除 —— 弹层收起后那一下勾也看不到了，不留这个状态。 */
    supportSheet:false,
    /* 全局轻提示 toast（2026-10-04 需求：点客服邮箱那行复制完，屏幕上浮出一记「已复制」）：
       toast 是提示文案（'' = 不显示），由 showToast() 置上、约 1.4s 后由 toastTimer 摘掉重渲染。
       项目里的 toast 组件早年已整体删除，这里是按本轮需求重新加回的**最小一版**：只有一枚
       居中偏下的深色胶囊（.app-toast，样式在 theme.css），不区分成功 / 失败、也没有关闭按钮，
       不吃点击（pointer-events:none）。同样是页面内存、不落库。 */
    toast:'', toastTimer:null,
    /* 「问题反馈」页（appFeedbackPage，2026-10-04 按设计图从 sheet 卡片重做成深色整页）：
       feedbackType 是选中的问题类型（FEEDBACK_TYPES 之一，入口可预选 ——
       2026-10-04 晚些前由「我的 · 键盘内容投诉与举报」预选，该行已删、现在一律从默认档起）；
       feedbackText / feedbackContact 是问题描述与联系方式的草稿。
       这一页的控件是真 textarea / input（不再是 sheet 里靠 formCache 兜的表单域），
       三项显式存在这里：换类型、重渲染都不丢已输入内容；每次进页开一张新表单（见 openAppScreen）。
       都是页面内存、不落库。 */
    feedbackType:'功能问题', feedbackText:'', feedbackContact:'',
    /* —— 「邀请有礼」页（2026-10-05 新增，页见 appInvitePage / 动作见 invite-* 一组）——
       inviteCode 是本人专属邀请码（展示值，默认 LC7K2M，落库 —— 真实产品由服务端按账号生成）；
       inviteClaim 是「我作为被邀请方」的领取记录（{code,at}，领过一次就不能再填别人的码，落库）；
       inviteFriends 是「我作为邀请方」的邀请记录（{id,phone,status,days}）——
       **好友侧没有头像、没有昵称，只有手机号**，所以记录列表就按掩码手机号展示，不带头像；
       status 'pending' = 好友已填码、还没用过 AI（奖励待激活）；'active' = 好友首次用过 AI、
       奖励已到账 —— 预置两条演示记录（一名已到账 + 一名待激活）并落库；
       推进「待激活 → 已到账」走左栏「模拟 › 模拟好友使用AI」（见 simInviteUse）；
       inviteStepsClaimed 是已发放过的阶梯奖励档位（人数数组，落库，防重复发放）；
       inviteDraft / inviteError 是填写区草稿与校验提示（内存，每次进页清空）；
       inviteCopied 是两枚复制按钮的即时反馈（'code' | 'msg'，约 1.2s 复原，内存）；
       inviteRulesOpen 是活动规则区「展开全部 / 收起」的展开态（内存）。 */
    inviteCode: saved.inviteCode || 'LC7K2M',
    inviteClaim: saved.inviteClaim || null,
    inviteFriends: Array.isArray(saved.inviteFriends) ? saved.inviteFriends : [
      {id:'iv1',phone:'138****6688',status:'active',days:3},
      {id:'iv2',phone:'137****2233',status:'pending',days:3},
    ],
    inviteStepsClaimed: Array.isArray(saved.inviteStepsClaimed) ? saved.inviteStepsClaimed : [],
    inviteDraft:'', inviteError:'', inviteCopied:'', inviteCopiedTimer:null, inviteRulesOpen:false,
  };
  /* 主 App 形态启动（**缺省形态**，2026-10-04 起；`?surface=app` 也走这一支）。
     进入不再直接落首页：先走一遍状态检查链
     appEntryCheck() —— 键盘未开启就整页进「开启键盘」引导、完全访问没开弹引导层、
     未登录弹登录层，都通过才落首页。放定时器里跑：
     启动脚本还没跑完（后面还有 const），同步调用 render 会踩 TDZ。 */
  if (state.appView === 'app') {
    setTimeout(appEntryCheck, 0);
  }
  /* 会员商品表：主 App 的会员开通覆盖层与键盘内付费引导**共用同一张**（两处同一套设计、
     同一份档位，不再各卖各的）—— 永久 / 周 / 季度三档，都带 origin 划线原价（**只给药两句
     用**：周 / 季度档「到期后 ¥xx/期自动续订」报的就是它，2026-10-04 需求；键盘付费层的
     档位卡仍照设计图把它当划线价显示）。
     badge = 「立即解锁」按钮右上角那枚角标（键盘会员开通层用，说的是买法：一次性买断 / 畅享 N 天）；
     **原 cardBadge / cardNote 两个字段**（主 App 第一个购买页档位卡顶部的蓝角标与现价下面那行
     生活化小字）已随该页 2026-10-06 整页删除，勿再补回。
     days = 购买成功后按它算出 state.memberExpiry（「我的」显示到期日），永久档 0 = 永久。
     2026-09-26 起主 App 不再单独维护「月度 / 年度 / 100 积分」那张表（原 plans 随
     「会员与积分」整页一并删除；积分档就此不再存在）。 */
  const PLANS = {
    permanent:{name:'永久会员',price:'128',origin:'576',detail:'永久 AI 权益',kind:'member',days:0,badge:'一次性买断'},
    week:{name:'周会员',price:'9.9',origin:'48',detail:'7 天 AI 权益',kind:'member',days:7,badge:'畅享 7 天'},
    quarter:{name:'季度会员',price:'98',origin:'128',detail:'90 天 AI 权益',kind:'member',days:90,badge:'畅享 90 天'},
  };
  /* 自动续订说明（照设计图 1:1 的 iTunes 文案）—— **只有键盘会员开通覆盖层（kb-paywall）在用**：
     iOS 的周 / 季度档在协议行下方压这一段（超出键盘首屏、往上滚一段才见）；
     经 uiContext 传给 kb-paywall 组件（2026-09-29 三次需求起组件不再自带一份）。
     第一个会员购买页曾直接渲染它（2026-10-06 已按需求整页删除）。改文案只改这里。 */
  const RENEWAL_NOTE = '确认购买并支付后，将通过您的iTunes账号自动续订。苹果iTunes账户会在到期前24小时内扣费，扣费成功后订阅周期顺延一个订阅周期。如需取消续订，请在当前订阅周期到期前24小时以前，手动在iTunes/AppleID设置管理中关闭自动续费功能。试用期内，iTunes账户如不取消订阅，则会在试用周期结束时自动开通订阅并扣款，未使用的试用时长在购买订阅之后将会自动作废。本协议由您自主选择是否取消，若您选择不取消，将为您开通下一个订阅周期的续费服务。免费试用机会每位用户仅可在首次订阅时试用一次。';
  /* 「会员购买页 · 新」（appPurchasePlusCopyPage，2026-10-06 新增，appScreen='purchase2-copy'；
    **同日晚些需求由「会员购买页 · 新2」改名回这个名字**）
    的档位表（**原第二个购买页 purchase2 / appPurchasePlusPage 2026-10-06
    已按需求整页删除**，这张表与 .pu2-* 那套皮肤由本页独享；勿再补回原页）—— 照用户设计图 1:1：
    永久 / 季度 / 周三档，各带一枚「立减 ¥xx」胶囊（cut），卡上的划线原价取 origin
    （**2026-10-06 晚些需求起主按钮不再显示价格与划线价**）。
    **与 PLANS（键盘会员开通层那张表）各自独立**：两边商品体系不一样
    （PLANS 是永久 / 周 / 季度，这里是永久 / 季度 / 周），本页不读也不改 PLANS；
    （**2026-10-06 起第一个购买页 purchase 也已整页删除**，这张表与 PLANS 的分头不再是
    「两页各一张表」，而是「会员购买页 / 键盘付费层各一张表」）
    days 供到账时算会员到期日（永久档 0 = 永久，与 PLANS 同一口径，见 checkoutPlan / completePurchase）；
    promo 是档位名右边那枚促销胶囊（**2026-10-06 再晚些需求起只有永久档挂**「低至0.01元/日」
    黄色一枚 —— 原「三档都挂」口径收回：季度 / 周的「低至xx元/每日」与 promoTone 整体删除，
    theme.css 的 .pu2-plan-promo.silver / .copper 修饰类随之删掉、勿再补回）；
    sub 是价格后面那句灰色标语
    （2026-10-05 需求：三档都填 —— 永久档由「一次购买，终身免费」换成「用与TA吃一顿饭的钱换终身的从容」，
    季度 / 周是「一束鲜花的钱」「一杯奶茶的钱」，与已删除的第一个购买页 cardNote 同一套生活化对比口径）；
    cardBadge = 档位卡顶部浮的那枚蓝角标，说的是用户选择占比（永久 85% / 季度 3% / 周 12% 的用户选择，
    2026-10-05 需求加的 —— 仍只在选中的卡上显示，键盘付费层不渲染它）；
    badge = 「立即解锁」按钮右上角那枚红角标（**2026-10-06 晚些需求加的**，与键盘付费层那颗
    同口径 —— 文案随档位变：永久「一次性买断」/ 季度「畅享 90 天」/ 周「畅享 7 天」）。
    2026-10-06 晚些需求：原「月度会员」档改成「周会员」（¥9.9 / 划价 ¥48 /「一杯奶茶的钱」，
    与键盘付费层 PLANS 的周档同价；cut ≈ origin − 现价）。
    **2026-10-06 再晚些需求（本轮）三档改价**：永久 ¥128/划价 ¥218 → **¥168 / ¥840**、
    季度 ¥98/¥128 → **¥88 / ¥148**、周档现价不动、划价 ¥48 → **¥28**（cut 跟着改成
    origin − 现价：672 / 60 / 18 —— 本页档位卡 2026-10-06 起不再渲染 cut，这两个数只作口径留档）。
    同日还新增「永久会员立减优惠」挽留弹窗（点购买页 x 触发，见 pu2OfferSheet / state.pu2Offer）——
    **领取后永久档按立减 40 显示：现价 168 → 128**（划线原价仍取 origin 840，
    见 OFFER_SAVE / offerPrice / appPurchasePlusCopyPage 的卡片渲染）。 */
  const PLUS_PLANS = {
    permanent:{name:'永久会员',price:'168',origin:'840',cut:'672',days:0,sub:'用与TA吃一顿饭的钱换终身的从容',promo:'低至0.01元/日',cardBadge:'85%的用户选择',badge:'一次性买断'},
    quarter:{name:'季度会员',price:'88',origin:'148',cut:'60',days:90,sub:'一束鲜花的钱',cardBadge:'3%的用户选择',badge:'畅享 90 天'},
    week:{name:'周会员',price:'9.9',origin:'28',cut:'18',days:7,sub:'一杯奶茶的钱',cardBadge:'12%的用户选择',badge:'畅享 7 天'},
  };
  const samples = [
    {id:'s1',name:'与林间的聊天',time:'14:32',messages:['今天有点累，感觉什么都没做好。','要不要一起出来走走？','好呀，但我可能不太想说话。']},
    {id:'s2',name:'周末计划',time:'昨天',messages:['周末有什么安排？','还没想好，你呢？','发现了一家新开的书店。']},
    {id:'s3',name:'一段工作对话',time:'周四',messages:['方案好像还差一点感觉。','你觉得哪部分需要再调整？','整体很好，细节我们一起再看看。']},
    {id:'s4',name:'周末的小风景',time:'上周',image:'assets/illustrations/conversation_garden_v3.png'},
    {id:'s5',name:'聊天灵感',time:'上周',image:'assets/illustrations/open_ideas_v3.png'},
    {id:'s6',name:'关系备忘',time:'上周',image:'assets/illustrations/relationship_context_v2.png'},
    {id:'s7',name:'下班路上',time:'周一 18:30',messages:['下班了吗？','刚出地铁。','那我去接你吧。']},
    {id:'s8',name:'周末的约定',time:'周二 20:14',messages:['这周末有空吗？','应该可以，怎么了？','想约你去看展。']},
    {id:'s9',name:'和朋友的一天',time:'昨天 22:47',messages:['最近还好吗？','还行，就是有点忙。','有空一起吃个饭吧。']},
    {id:'s10',name:'晚安之前',time:'周日 23:05',messages:['困了就先睡吧。','再聊五分钟嘛。','好，那再聊五分钟。']},
  ];
  /* 模拟头像候选（生成物：assets/avatars/mock-*.jpg，AI 生成后压成 320×320 JPEG，
     与头像上传的 canvas 压缩规格一致）：选图面板的头像模式（kb-photo-picker）主要出这一批。
     姓名只用于缩略图的 alt / aria-label（网格里不显示文字），按人物特征起名便于读屏。 */
  const mockAvatars = [
    {id:'av1',name:'长发女生',image:'assets/avatars/mock-1.jpg'},
    {id:'av2',name:'短发眼镜女生',image:'assets/avatars/mock-2.jpg'},
    {id:'av3',name:'卷发男生',image:'assets/avatars/mock-3.jpg'},
    {id:'av4',name:'低马尾女生',image:'assets/avatars/mock-4.jpg'},
    {id:'av5',name:'短发中性风',image:'assets/avatars/mock-5.jpg'},
    {id:'av6',name:'圆脸卷发男生',image:'assets/avatars/mock-6.jpg'},
    {id:'av7',name:'波波头女生',image:'assets/avatars/mock-7.jpg'},
    {id:'av8',name:'银发奶奶',image:'assets/avatars/mock-8.jpg'},
    {id:'av9',name:'棒球帽少年',image:'assets/avatars/mock-9.jpg'},
    {id:'av10',name:'挑染长发女生',image:'assets/avatars/mock-10.jpg'},
    {id:'av11',name:'胡须大叔',image:'assets/avatars/mock-11.jpg'},
    {id:'av12',name:'羊毛卷女生',image:'assets/avatars/mock-12.jpg'},
  ];
  /* 候选词词典（拼音 / 九宫格）已随候选词栏组件维护：components/shared/kb-candidates.js */
  function persist() {
    try {
      localStorage.setItem(STORE,JSON.stringify({platform:state.platform,dark:state.dark,layout:state.layout,loggedIn:state.loggedIn,
        nickname:state.nickname,credits:state.credits,member:state.member,memberExpiry:state.memberExpiry,
        /* 「模拟试用额度耗尽」的开关状态与快照一起落库：积分与开关始终成对（见 state 顶部注释） */
        creditsOut:state.creditsOut,creditsSnapshot:state.creditsSnapshot,
        /* 资料引导的结果一起落库：生日（跳过则留空）+「模拟 › 已设置性别」开关（见 state.genderSet） */
        partners:state.partners,gender:state.gender,age:state.age,birthday:state.birthday,genderSet:state.genderSet,
        /* 用户 ID（state.memberId）也落库（「用户」页显示的那枚展示值） */
        memberId:state.memberId,
        /* 「邀请有礼」页的四个落库字段（2026-10-05 新增，见 state 顶部说明）：
           专属邀请码 / 我的领取记录 / 我的邀请记录 / 已发放的阶梯奖励档位 */
        inviteCode:state.inviteCode,inviteClaim:state.inviteClaim,inviteFriends:state.inviteFriends,inviteStepsClaimed:state.inviteStepsClaimed,
        /* 「兑换码」弹层里已用过的码也落库（state.redeemUsed，2026-10-06 新增）——
           每个兑换码只能兑一次，刷新后重复输入同一码要给「已被使用」 */
        redeemUsed:state.redeemUsed,
        /* 「永久会员立减优惠」挽留弹窗的两个落库字段（state.offerDate / offerClaimed，
           2026-10-06 需求）：上次弹窗日期（「当天已弹过就不弹」的判据）+ 优惠是否已领取
           （领取后当天永久档按 128 显示，跨天由日期比对自动失效） */
        offerDate:state.offerDate,offerClaimed:state.offerClaimed}));
    } catch (_) {}
  }
  function person() { return state.partners.find(p=>p.id===state.selectedPartner); }
  /* 列表排序：刚新建 / 编辑过的对象一律排到列表最前 —— 保存回列表时第一眼看到的就是它。
     其余对象保持原有相对顺序（先把这一条从原位置取出、再插回队首，不会打乱它们之间次序）。 */
  function frontPartner(p) {
    const i=state.partners.findIndex(x=>x.id===p.id);
    if(i>=0)state.partners.splice(i,1);
    state.partners.unshift(p);
    return p;
  }
  function personName() { return person()?.name || '不选择'; }
  function platformName() { return window.LoveCoKit.platformName(state.platform); }
  /* 聊天对象头像：没设过自定义头像的一律用默认头像插画（AV.chat）—— 默认的三个对象、新建的、
     老存档里旧默认头像被丢掉的那些都走这一条；AV 缺失才轮到 avatar() 的首字兜底 */
  function partnerAvatar(p=person()) { return avatar(p?.name||'无',p?.color, p?.avatar || AV.chat || ''); }
  /* 「我」的头像：微信聊天页右侧行与账户页共用同一张插画（AV.self，本轮不动），缺失时退回首字 */
  function selfAvatar() { return avatar(state.nickname || '我', 'coral', AV.self || ''); }
  /* 当前生效的组合串：九宫格打字时 state.composition 存的是数字（如 53），
     展示与候选词都基于它推出的拼音字母组合（ke / le / j …，见 core/ime.js 的 activePath），
     选中的那条记在 state.t9Path；26 键拼音原样返回。 */
  function activeComposition() {
    return ime.activePath(state.composition, state.t9Path);
  }
  /* 输入框的显示文本 = 已确认文本 + 未确认的组合串（叠在光标锚点处）。
    组合串是输入法内部的「待确认」状态，不在 state.host 里：
    点候选词、空格、回车时才由 commitComposition 真正写进文本
    —— 用户看到的因此是「字母直接出现在输入框里，选词后变成候选词」。
    组合串只为「当前打字目标」服务：对象编辑面板打开时它在备注名里（见 partnerNameDisplay），
    宿主输入框保持干净。 */
  function displayText(key) {
    const text = state[key];
    if (!state.composition || typingInPartner() || typingInFree()) return text;
    const pos = Math.min(state.hostCaret, text.length);
    return text.slice(0, pos) + activeComposition() + text.slice(pos);
  }
  /* 输入框里 DOM 光标位置 → 已确认文本里的锚点：组合串显示在锚点之后，
     所以落在组合串后面的光标要减掉组合串长度；点在组合串中间时锚点不动。 */
  function composeAnchor(position, key) {
    if (!state.composition) return position;
    const anchor = key === 'host' ? state.hostCaret : targetCaret();
    const end = anchor + activeComposition().length;
    if (position <= anchor) return position;
    if (position >= end) return position - state.composition.length;
    return anchor;
  }
  /* 未确认的组合串在输入框里要带下划线，但 textarea / input 只画整块文本、没法只给一段字加线：
     每个输入框外面套了一层 .input-wrap，里面压着 .compose-mirror —— 内容与输入框的显示值
     一模一样，文字透明，只给组合串那一段画线（下划线样式见 theme.css 的 .composing）。
     字号 / 行高 / 内边距 / 边框不另写一份 CSS，直接从输入框的实时计算样式抄，
     所以输入框自己的样式（含各端媒体查询）改了，下划线也跟得上；
     框里滚动时（长文本）滚动位置一起抄，线不会跑偏。没有组合串时这一层是空的。
     两个宿主：宿主聊天输入框（#host，锚点 hostCaret）与编辑面板的备注名（#partner-name，
     锚点 partnerCaret）—— 组合串落在哪个框里，就由哪个框的锚点算。 */
  function paintComposeMirror() {
    document.querySelectorAll('.compose-mirror').forEach(mirror => {
      const key = mirror.dataset.mirror;
      const box = key ? document.getElementById(key) : null;
      const composing = box ? activeComposition() : '';
      const anchor = key === 'host' ? state.hostCaret : targetCaret();
      /* 组合串必须真的在框里那段位置上（显示值由 displayText 拼出来），否则不画线：
         焦点或状态刚变、框里还没重渲染时宁可不画，也不能画错地方。 */
      if (!composing || !box.value.startsWith(composing, anchor)) { mirror.textContent = ''; return; }
      const metrics = getComputedStyle(box);
      ['fontFamily','fontSize','fontWeight','fontStyle','letterSpacing','lineHeight','wordSpacing','textIndent','textTransform','textAlign','direction','whiteSpace','overflowWrap','wordBreak','tabSize'].forEach(name => { mirror.style[name] = metrics[name]; });
      ['Top','Right','Bottom','Left'].forEach(side => {
        mirror.style[`padding${side}`] = metrics[`padding${side}`];
        mirror.style[`border${side}Width`] = metrics[`border${side}Width`];
      });
      mirror.scrollTop = box.scrollTop;
      mirror.scrollLeft = box.scrollLeft;
      mirror.innerHTML = `${esc(box.value.slice(0, anchor))}<span class="composing">${esc(composing)}</span>${esc(box.value.slice(anchor + composing.length))}`;
    });
  }
  /* 问AI 页提问输入框（#free-chat）的高度：内容超过一行就长高、**最多三行**（再多框内滚动）。
     框长高（以及常驻的快捷栏、选中图片后多出的缩略图行）会把整块键盘一起往上顶：多出来的实际高度
     记进 **.phone 上的** --lc-free-extra，由 theme.css 的 .keyboard.free-chat 算进总高 ——
     键区高度因此始终不变，切进 / 切出这一页也不跳。
     特意写在 .phone 而不是键盘元素上：它是键盘与按住说话遮罩的共同祖先，两边读同一个值，
     遮罩的高度因此能跟着键盘一起长（见 theme.css 的 .phone:has(.keyboard…) 那两条）。
     行高 / 内边距 / 边框都从框的实时计算样式读（与 paintComposeMirror 同一套做法），
     改样式（含矮窗口媒体查询）不用回来改这里；不在这一页时把值清成 0，免得留在下一次。 */
  const FREE_INPUT_LINES = 3;
  function paintFreeInputGrowth() {
    const keyboard = $('.keyboard.free-chat');
    const block = $('.kb-free-chat');
    const scopeEl = $('.phone') || keyboard;
    if (!keyboard || !block) { scopeEl?.style.setProperty('--lc-free-extra', '0px'); return; }
    const input = $('#free-chat');
    if (input) {
      input.style.height = 'auto';
      const box = getComputedStyle(input);
      const line = parseFloat(box.lineHeight) || 18;
      const chrome = ['Top','Bottom'].reduce((sum, side) => sum + (parseFloat(box[`padding${side}`]) || 0) + (parseFloat(box[`border${side}Width`]) || 0), 0);
      const border = (parseFloat(box.borderTopWidth) || 0) + (parseFloat(box.borderBottomWidth) || 0);
      input.style.height = `${Math.min(Math.round(line * FREE_INPUT_LINES + chrome), input.scrollHeight + border)}px`;
    }
    /* 这一块本来就该高的那几行：标题行（或打字时的候选词栏，都是 --lc-toolbar-height，
       顶替菜单栏、不额外占高）与提问输入行（--lc-free-row-height）—— 多出来的才算加高。
       标题栏 / 候选词栏不一定在（主 App「AI 咨询师」页的常驻输入栏就没有，见 kb-free-chat.js），
       按它**实际在不在**算；一律按有标题栏算的话，那一形态会把 40px 当成「多出来的」、
       extra 记少一截（调出键盘 / 系统键盘时高度公式随之差 40px）。 */
    const scope = getComputedStyle(keyboard);
    const hasBar = Boolean(block.querySelector('.free-title, .candidates'));
    const base = (parseFloat(scope.getPropertyValue('--lc-free-row-height')) || 44)
      + (hasBar ? (parseFloat(scope.getPropertyValue('--lc-toolbar-height')) || 40) : 0);
    scopeEl.style.setProperty('--lc-free-extra', `${Math.max(0, block.offsetHeight - base)}px`);
  }
  /* 可选截图：内置样例（samples），供键盘选择器面板（kb-photo-picker）出图 */
  function photoItems() { return samples; }
  /* 头像候选：模拟头像整批在前，样例里带位图的条目（三张插画）继续跟在后面可选 ——
     头像模式只能吃带位图的条目，聊天截图卡是 CSS 画的、没有位图当不了头像。 */
  function avatarItems() { return mockAvatars.concat(samples.filter(s => s.image)); }
  /* 组件上下文：组件通过 ctx 读取平台与状态，不直接依赖 app.js 的内部作用域。
     platform 每次调用重新求值，因此切换平台后无需重建上下文。 */
  function uiContext() {
    return { platform: state.platform, state, esc, icon, ib, primary, avatar, noneAvatar, person, personName, partnerAvatar, selfAvatar, hostChat: HOST_CHAT, displayText, partnerNameDisplay, freeChatDisplay, enterKeyLabel, targetContext, freeShortcuts: FREE_SHORTCUTS, kbLoginReady, photos: photoItems, avatars: avatarItems, defaultAvatar: AV.chat || '', shot, shotThumb: shotThumbImage, pendingShot: pendingShotItem, kbLegal: kbLegalDoc, plans: PLANS, checkout: checkoutPlan(), renewalNote: RENEWAL_NOTE, stages, defaultStage: DEFAULT_STAGE, md: mdHtml, guideDemo: GUIDE_DEMO };
  }
  /* 主 App 的对象编辑页（「对象」Tab 的新增 / 编辑，整页）。相比键盘形态的编辑面板
     （kb-partner-editor：只有备注名 + 关系阶段），这一页多两个字段：
     ① 性别下拉 —— 新建态默认取「当前用户性别的反」（用户是男 → 默认女，用户是女 → 默认男；
        用户自己还没设置性别时落到「女」），编辑态仍预填对象当前值；
     ② 备注信息多行输入 —— 自由写 TA 的情况交给 AI，提示语带年龄 / 职业 / 爱好三个关键词。 */
  function defaultPartnerGender() {
    return {男:'女',女:'男'}[state.gender] || '女';
  }
  function partnerEditor() {
    const p=state.partners.find(item=>item.id===state.modalData.id);
    const draft=state.modalData.avatar ?? p?.avatar ?? '';
    const gender=p?.gender||defaultPartnerGender();
    /* 新建态没有 stage 可预填：显式选中默认档位「熟悉」，而不是靠浏览器默认选中第一项 */
    const stage=p?.stage||DEFAULT_STAGE;
    return `<div class="app-content app-page">
      <div class="app-page-head"><h2>${p?'编辑聊天对象':'新增聊天对象'}</h2>${ib('Close','退出','close')}</div>
      <div class="app-card app-card-pad partner-editor">
        <button class="editor-avatar-button" data-action="choose-avatar" title="选择头像" aria-label="选择头像">${draft||p?avatar(p?.name||'',p?.color,draft):noneAvatar()}<span>${draft?'更换头像':'上传头像'}</span></button>
        <label class="field">备注名<input id="partner-name" maxlength="20" value="${esc(p?.name||'')}" placeholder="输入备注名"></label>
        <label class="field">性别<select id="partner-gender">${['暂不设置','女','男'].map(v=>`<option ${gender===v?'selected':''}>${v}</option>`).join('')}</select></label>
        <label class="field">关系阶段<select id="partner-stage">${stages.map(v=>`<option ${stage===v?'selected':''}>${v}</option>`).join('')}</select></label>
        <label class="field">备注信息<textarea id="partner-note" maxlength="200" rows="4" placeholder="写下 TA 的年龄、职业、爱好，例如「28 岁，设计师，喜欢露营和看展」。写得越细，AI 越懂 TA。">${esc(p?.note||'')}</textarea></label>
      </div>
      <div class="app-page-foot">${primary('确定','save-partner','')}</div>
    </div>`;
  }
  /* 宿主 App（微信）会话时间戳：9月20日 星期日 15:21。
     时间由消息自己带出来（`m.time`）—— 微信只在时段间隔较大时才插一行时间，
     同一时段连着发的消息不带，所以不在渲染层按固定节奏补。 */
  function wxStamp(date = new Date()) {
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${date.getMonth() + 1}月${date.getDate()}日 星期${'日一二三四五六'[date.getDay()]} ${hh}:${mm}`;
  }
  function wxAgo(days, hour, minute) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    date.setHours(hour, minute, 0, 0);
    return wxStamp(date);
  }
  /* 种子消息固定演林间这套模板（见 HOST_CHAT），不再按当前对象换文案；
     切换 / 删除聊天对象也不重建会话 —— 第三方 App 与键盘侧对象彻底解耦。
     仅启动时播一次种子（原「清空聊天记录」入口已随会话菜单删除）。 */
  function initMessages() {
    state.messages = [{time:wxAgo(2,20,14),text:'终于下班了，今天真的好漫长。',mine:false},
      {text:'辛苦啦，今天过得怎么样？',mine:true},
      {text:'今天有点累，感觉什么都没做好。',mine:false},
      {time:wxAgo(1,9,7),text:'那你早点休息，我也赶紧把活干完撤了。',mine:true}];
    state.draft = state.messages.at(-1).text;
  }
  initMessages();
  function platformButtons() { return `<div class="segmented">${[['harmony','鸿蒙'],['android','Android'],['ios','iOS']].map(([id,name])=>`<button data-action="platform:${id}" class="${state.platform===id?'active':''}" aria-pressed="${state.platform===id}">${name}</button>`).join('')}</div>`; }
  /* App形态切换：主 App（LoveCo 自己的界面）/ 键盘（在宿主 App 中唤起 LoveCo 键盘）。 */
  function surfaceButtons() { return `<div class="segmented" role="group" aria-label="App形态">${[['app','主 App'],['keyboard','键盘']].map(([id,name])=>`<button data-action="surface:${id}" class="${state.appView===id?'active':''}" aria-pressed="${state.appView===id}">${name}</button>`).join('')}</div>`; }
  /* —— 页面目录：两种 App形态各自的全部页面 / 组件形态 ——
     列表按当前形态过滤（pageCatalog），同一 UI 的不同分支形态各占一条
     （例：键盘菜单栏的「未选择对象」与「已选择对象」是 kb-toolbar 的两种形态）。
     setup() 负责点击后把手机跳到该页面；详情（页面路径 / 触发方式 / 页面功能与设计 / 备注）由 pageDetail() 展示在手机下方。
     desc 就是这个「页面功能与设计」：既要说清这个页面能做什么（功能），也要写清它长什么样、怎么排布、视觉与交互的设计取舍。
     两个目录都带 group 分组（主 App 形态 2026-09-29 起与键盘形态一样分组）：
     APP_PAGES 十组 —— 首页与我的 / 会员中心 / 键盘权限 / 登录 / 账户与协议 / 聊天对象 / 开启键盘引导 / 模拟系统设置 / 资料引导 / 演示
     （同名组「会员中心」「聊天对象」与键盘形态共用、折叠状态互通；条目按组连续排列，pageList() 靠相邻条目的组名变化插组头；
     **2026-10-05 需求：组名「会员与积分」改「会员中心」** —— 键盘形态同名组一起改，手机「我的」页「账户」卡片那行入口也一并改）。 */
  const KB_PAGES = [
    {id:'host-chat',group:'宿主会话与菜单栏',name:'宿主会话（微信）',route:'宿主 App › 会话界面',trigger:'在聊天类宿主 App 中唤起 LoveCo 键盘即显示（键盘侧的前置检查先跑：没有完全访问权限先弹「键盘完全访问引导页」，权限已开又未登录再弹「键盘内登录页」，都在「键盘权限与登录」组；两层都通过才看到底座键盘）；关闭键盘上的覆盖层 / 退出打字后回到这里；点消息区 / 会话头部收起键盘（见「宿主会话 · 键盘收起」），收起后点输入框唤回',desc:'微信风格的宿主聊天界面：头部（居中备注名）、消息区（对方头像 = 宿主会话固定模板里的那枚女生头像 AV.peer —— 2026-10-06 晚些需求起聊天样式页不再用 akalin 线稿）、输入栏，LoveCo 键盘占下半屏；点消息区 / 头部即收起键盘（键盘的任何状态与页面一并清场），收起后点输入框重新弹出',note:'宿主会话是固定聊天模板（演「林间」），切换聊天对象不影响会话内容；头部的返回 / 会话菜单入口已按要求删除'},
    {id:'host-chat-collapsed',group:'宿主会话与菜单栏',name:'宿主会话 · 键盘收起',route:'宿主 App › 会话界面（键盘已收起）',trigger:'点宿主聊天区域（消息区 / 会话头部，不含输入栏）；键盘处在任何状态 / 页面时都生效',desc:'收起态：整块 LoveCo 键盘不渲染，由消息区与输入栏之间的一块「键盘让位区」（.wx-kb-space，高度 = 常规键盘高、会话底色 #111）顶上原来键盘占的那段 —— 消息区的高度与键盘在屏时完全一致、气泡列停原位不下移，只有输入栏被顶到屏幕底边（下方不再有键盘的浅色块）；手机里自上而下仍是顶部状态栏、会话头部（36px 居中备注名）、消息区、让位区、输入栏；点输入框（含框内麦克风以外的整块输入区）即把键盘唤回，唤回时落在干净底座（菜单栏 + 字母层，布局沿用设置里选的那套），光标交回输入框。功能上它是一次「全清」：无论键盘此刻是菜单栏 / 候选词栏 / 数字 · 符号层，还是开着对象管理页、键盘设置页、选图选择器、AI 分析过渡页、聊天分析面板、对象编辑面板，点聊天区域都一次性收走并清场（生成中的 AI 请求随之取消、未确认的拼音组合串丢弃、编辑面板先兜底落库）；已经收起时再点聊天区域不重渲染。宿主输入框草稿与会话消息不受影响 —— 收起的是键盘，不是用户打的字。**唤回键盘时会先跑一遍前置检查**：没有完全访问权限先弹「键盘完全访问引导页」，权限已开又未登录再弹键盘内登录层（见「键盘权限与登录」组），都通过才回到底座键盘',note:'与「宿主会话（微信）」是同一屏的两种形态（键盘在 / 键盘收起）；键盘已激活时点输入框不做任何操作（只更新光标锚点与下划线镜像）；进主 App 再返回、切运行平台、从页面列表点进任何键盘页面都会把键盘拉回常驻'},
    {id:'composer-empty',group:'宿主会话与菜单栏',name:'宿主输入栏 · 空态',route:'宿主 App › 会话输入栏',trigger:'宿主输入框没有内容时（默认状态）',desc:'左侧语音圆钮（按住说话）+ 输入框（框内麦克风同样是按住说话），右侧只有一个表情圆钮',note:'与「宿主输入栏 · 输入中」是同一输入栏（chat-composer）的两种形态'},
    {id:'composer-typing',group:'宿主会话与菜单栏',name:'宿主输入栏 · 输入中',route:'宿主 App › 会话输入栏',trigger:'输入框里有文字（键盘输入 / 语音转写写入 / 思路带入）',desc:'右侧表情圆钮换成蓝色的「发送」键，点击把输入框内容作为「我」的消息发进会话并清空输入框',note:'两种形态只差右侧按键；左侧语音圆钮与框内麦克风在两种状态下都在'},
    {id:'kb-toolbar-default',group:'宿主会话与菜单栏',name:'键盘菜单栏 · 未选择对象',route:'键盘 › 顶部菜单栏（第一状态）',trigger:'唤起键盘默认显示；或在聊天对象管理页选「不选择」后返回',desc:'左侧灰色用户图标 +「未选择」（点击进聊天对象管理页），右侧三个入口：问AI（气泡）、相册（键盘选择器）、键盘设置',note:'与「已选择对象」是同一组件（kb-toolbar）的两种形态'},
    {id:'kb-toolbar-partner',group:'宿主会话与菜单栏',name:'键盘菜单栏 · 已选择对象',route:'键盘 › 顶部菜单栏（第一状态）',trigger:'在聊天对象管理页选择任一对象后返回',desc:'左侧显示当前对象的圆形插画头像（没设自定义头像的一律用默认头像插画，2026-10-06 起三张旧插画统一换成用户提供的那张中性线稿图）+ 备注名（点击回聊天对象管理页），右侧入口同上（问AI / 相册 / 键盘设置）',note:'头像即键盘侧上下文来源，切换对象只影响键盘侧的生成，不影响宿主会话'},
    {id:'kb-toolbar-shot',group:'宿主会话与菜单栏',name:'键盘菜单栏 · 待分析截图',route:'键盘 › 顶部菜单栏（截屏提示态）',trigger:'键盘收起 / 不在屏时点左栏「模拟 › 模拟截屏」（或仿真控制台里的同名按钮）产生一张截屏 —— 键盘当时感知不到这次截屏，截图先躺在相册里；随后把键盘唤起（点宿主输入框），**完全访问权限 → 登录状态 → 相册访问权限 = 完整访问** 三关都通过后，菜单栏最右侧的相册图标就地换成这张截图的缩略图',desc:'菜单栏相册入口的第三种形态（前两种是「未选择对象」「已选择对象」）：键盘不在屏时截的图会在键盘回来时补一个入口 —— 相册图标**就地换成那张截图的缩略图**：一枚**方形真缩略图**（28×28，与旁边两枚图标同宽）—— 这张聊天截图由 canvas 画成位图后导出（core/kit.js 的 shotThumb，同一张只画一次），深色底 + 几条气泡，缩略图边缘裁切、文字不再溢出（不再用 DOM 拼 3:4 卡片），整枚图标**持续放大缩小**（1.1s 一个来回，scale 1 → 1.12 配一圈淡紫呼吸光环）一闪一闪地引导点击；点它**不再经过选图面板**（不点图片按钮、不选图、不点分析），直接进「AI 分析」过渡动画页，之后的链路与「立即分析」完全一样。功能上这是键盘**感知截屏事件**的落点：键盘在屏时截屏根本不用提示 —— 那一下就自动进分析链路（「模拟截屏」的另一条分支）；只有键盘不在屏时，这次截屏才需要等键盘回来补一个入口。点掉它、再截一张，或从页面列表跳转，即回到普通相册图标；截图本身留在相册里，打开选择器仍可照常选用',note:'三关任一没过都不露脸（菜单栏仍是普通相册图标：没完全访问权限先弹引导页、未登录先弹登录页、相册不是完整访问则点图标走权限引导形态），条件补齐后同一张图自动露脸；提示位同一时刻只有一张（再截以最新那张为准），截图与提示都只在页面内存里（刷新即清 —— 「重置会话」入口 2026-10-03 已删）。本条目点入 = 现场补一张「刚刚的截图」并把三关置成通过（键盘完全访问开、已登录、相册完整访问），停在提示态便于查看 —— 点缩略图即真实走一遍 AI 分析链路'},
    {id:'kb-candidates',group:'宿主会话与菜单栏',name:'候选词栏 · 打字中',route:'键盘 › 顶部菜单栏（第二状态）',trigger:'中文键盘键区按任意字母 / 数字键进入打字态',desc:'一行候选词 + 最右侧 X（退回菜单栏）；未确认的拼音带下划线显示在宿主聊天输入框里（问AI 页 / 对象编辑面板打开时则显示在各自的输入框里），点候选词 / 空格 / 回车替换那句字母；联想词按当前输入目标光标前的文字算',note:'英文键盘、数字层、符号层按键直接上屏，不进入打字态'},
    /* 问AI 页（kb-free-chat 组件）：键盘菜单栏气泡按钮进入的「与 AI 对话」页面 —— 标题栏 + 输入区 + 键区；
       下两条是它的两种形态（展开图片选择器 / 按住输入框说话） */
    {id:'kb-free-chat',group:'宿主会话与菜单栏',name:'问AI（与AI对话的页面）',route:'键盘 › 键盘顶部（问AI 页）',trigger:'键盘菜单栏相册（图片）图标**左侧的气泡按钮**（data-action="free-chat"）；或从本列表点入（现场停在默认样式上：提问框留空、没有附图）',desc:'键盘里直接问 AI 的页面（标题就叫「问AI」），键盘顶部换成「标题栏 + 输入区」、键区照常在下（键区布局 / 层 / 中英与进入前一致）。① **标题栏**（高度 = 菜单栏 --lc-toolbar-height）—— 左侧 15px 加粗「问AI」、右侧一枚圆形 X（收起这一页回干净键盘页，与 Esc 同一条出口）；②③④ **输入区**（自上而下：缩略图行 / 快捷栏 / 提问输入行，其中 ② 只在选中过图片时出现、③ **常驻**（2026-10-06 晚些需求）—— 这一页默认是「标题栏 + 快捷栏 + 输入行」三行；②与③、③与④ 之间各有一条**分隔线**（整行铺满））；② **缩略图行**—— 已选截图最多 3 张（46px 圆角卡片、与下方网格同一份选择，左上角压一枚半透明黑底 X 提示「点一下移出」）+ 未满 3 张时的一枚「+」继续挑；③ **快捷栏**—— 一行预设问题「帮我回 / 这样回复如何 / 我最后一轮回复的如何」（文字**不带箭头符号**），**点一下立即发送**（点了就算发送，见下；这一栏常驻，既没打字也没附图时点它 = 把那句短语本身当作本次提问），窄机上三条放不下、这一行**可左右滑**（横向滚动，滚动条不出现在设计里）；④ **提问输入行**—— 左起当前聊天对象的圆形头像（32px，点击进聊天对象管理页；没设自定义头像时就是那张统一的默认头像插画）、中间白底圆角提问输入框（一行时 34px 高 / 圆角 8px / 13px 字 / 内边距 10px，**占位文案两态**：键区在下面时是「输入问题」、图片选择器展开时是「输入问题或按住说话」，内容超过一行自动长高、**最多三行**，再多框内滚动）、右端两枚按钮（自左向右：**语音**按钮 —— 按住即进「按住说话」；**图片**按钮 —— 图片选择器收起时是它，展开且已选图时换成蓝色圆形「发送」）。标题栏**顶替菜单栏**（同为 --lc-toolbar-height，不额外占高）；输入区涨出来的实际高度（缩略图行 + 快捷栏 + 输入框多出来的行）由 `.keyboard.free-chat` 的 --lc-free-extra 往上长，键区高度始终与平时一致（切进 / 切出这一页键区不跳）。**这一页打开时键区打字的目标就是那行提问输入框**：拼音字母带下划线落在框里、点候选词换成正文、删除键先删字母（与宿主输入框同一套输入法逻辑），光标锚点记在 state.freeCaret。**发送**（键区右下角那颗蓝键，或图片选择器展开时输入行右端那枚蓝色圆形**向上箭头**按钮，或快捷栏上任意一条短语 —— 后者点一下**立即发送**）把这次提问交给 AI：先「AI 分析过渡页」、再聊天分析面板的生成中，最后打字机输出结果；发送后这一页收起、输入与附图一并清空。**发起时点了哪条快捷栏短语决定结果结构**：点「帮我回」→ 聊天分析（draftKind = chat，关系简报 + 三组建议）；从蓝键 / 发送按钮 / 语音发的、以及其它那两条短语 → AI通用回复（draftKind = review，见「问AI · 图片选择器」一条）。点输入框是普通聚焦（放光标）；**按住不动 260ms 转成「按住说话」只在图片选择器展开时生效** —— 那时框下方是截图网格、框里没有光标，按住框就是「要说话」的手势；键区在下面时框里停着键盘的光标（键区打字的目标就是它），长按框留给编辑 / 选字，语音只能按右端那颗语音按钮（两种入口见「问AI · 按住说话」）。X / Esc 只收起这一页，提问内容留着（下次进来还在）；「设备权限 › 键盘完全访问」关着时发送与其它生成一样静默不执行',note:'AI 结果统一由聊天分析面板承接 —— 面板关闭即回干净键盘页；两种结果形态：点快捷栏「帮我回」→ 聊天分析（关系简报 + 三组建议，draftKind = chat），其余（其它短语、蓝键 / 发送按钮 / 语音发起）→ AI通用回复（不写分析正文的简报卡 + 卡内两段 markdown，draftKind = review）；附图时先走一遍上传仿真（/v1/uploads/complete），截图转写并入本次输入。打开这一页前会收起其它键盘层（管理页 / 设置页 / 选择器 / 分析面板 / 编辑面板），打字时这一页的标题栏那行换成候选词栏（见下一条）'},
    {id:'kb-free-chat-typing',group:'宿主会话与菜单栏',name:'问AI · 打字中',route:'键盘 › 键盘顶部（问AI 页 · 打字态）',trigger:'问AI 页里在键区按任意字母键（中文键盘）进入打字态',desc:'问AI 页的打字形态：**标题栏那一行换成候选词栏**（与平时打字完全一致，两者同为 --lc-toolbar-height，键盘高度不跳），**提问输入行保持可见** —— 候选词要落在它里面、提交时第几行都要看得见（快捷栏常驻，选中过图片时缩略图行也还在）；未确认的拼音字母带下划线显示在提问输入框里（下划线由 .compose-mirror 画，见 paintComposeMirror），点候选词 / 空格 / 回车把字母替换成候选词；候选词 / 联想词按这句提问光标前的文字算（targetContext）。两个出口：候选词栏最右侧的 X，或把组合串删干净后退回「问AI」标题栏 —— 两种都仍是这一页（提问内容不丢）。键区右下角那颗蓝键在打字态也还是「发送」：组合串非空时按第一下先上屏、再按才发送（不丢拼音）',note:'与「问AI（与AI对话的页面）」是同一页（kb-free-chat 组件）的两个状态；英文键盘 / 数字层 / 符号层按键直接上屏，不进打字态、不出候选词栏（与平时一致）'},
    /* 问AI 页的选图态与按住态：同一页（kb-free-chat 组件）的另外两种形态，各占一条 */
    {id:'kb-free-picker',group:'宿主会话与菜单栏',name:'问AI · 图片选择器',route:'键盘 › 输入行下方（问AI 页 · 选图态）',trigger:'问AI 页里点提问输入行右端的图片按钮（data-action="free-picker"），或点缩略图行尾的「+」（free-picker-add：补选第 2 / 3 张时唯一的入口）；或从本列表点入（现场带 1 张附图，缩略图行随之出现 —— 快捷栏本来就常驻）',desc:'问AI 页的选图形态 —— **不跳「选择聊天截图」整页**，输入行**下方**的键盘区域（键体 + 平台底栏）整个换成三列聊天截图网格：从底部往上滑出、盖住键区（`.free-picker`，超出后网格内滚动，一屏约两行半；底纹取键盘色，浅色外观下是浅底 + 深色聊天截图卡）。同时输入行上方多出**缩略图行**（**快捷栏**本来就常驻、不随选图出现，见 kb-free-chat 条目）—— 已选截图最多 3 张（与网格里选中的那张同源、读同一份 state.selectedPhotos），每张 46px 圆角、左上角压一枚半透明黑底 X 提示「点一下移出」（点整张即移出，复用选择器的 photo:<id> 动作），未满 3 张时跟一枚「+」继续挑；**快捷栏** —— 一行预设问题「帮我回 / 这样回复如何 / 我最后一轮回复的如何」（文字不带箭头符号，窄机上放不下可左右滑），**点一下立即发送**，点的那条决定结果结构：**「帮我回」→ 聊天分析**（关系简报 + 三组建议回复），**其余 → AI通用回复**。输入行右端那枚图片按钮此时换成**蓝色圆形「发送」（里面一枚白色向上箭头）**（free-send；未选图时仍是图片按钮）：按下把「输入的那句话 + 已选截图」一起交给 AI（带截图时先走一遍上传仿真，转写并入本次输入）→「AI 分析过渡页」→ 聊天分析面板生成中 → 打字机输出。相册权限两档引导照旧生效：有限访问只放出授权过的那张；完全没开时网格位置换成一行引导 +「去开启权限」',note:'出口：点提问输入框（回到键盘页，附图与那行文字还留着）、Esc（先收选择器，再按一次才收整页）、或直接发送（发送后附图一并清空）；再点一次图片按钮也收起（同一枚按钮的开 / 关，已选图时它已是「发送」）。缩略图行与网格是同一份状态：网格里点第 2 张，缩略图行就多第 2 张，最多 3 张'},
    {id:'kb-free-voice',group:'宿主会话与菜单栏',name:'问AI · 按住说话',route:'键盘 › 键盘区域（问AI 页 · 按住态）',trigger:'问AI 页里**按住提问输入行右端那颗语音按钮**（data-voice-hold="free"，按下即进按住态，两种状态下都可用）；或**按住提问输入框**不动 260ms（FREE_HOLD_MS，**只在图片选择器展开时**：那时框里没有光标；短按仍是普通聚焦 + 放光标，点框还会收起图片选择器）；或从本列表点入（现场：图片选择器展开 + 附图 1 张 + 快捷栏选中「帮我回」+ 按住态）',desc:'问AI 页的按住说话形态：输入框**下方**的那一块（键区，或正展开着的图片选择器网格）被蓝色毛玻璃遮罩整体盖住（`.voice-rec` 与键盘区域同高，上缘渐隐、与上方输入区自然融合），提示「松手发送，上滑取消」，一排蓝色波浪条起伏模拟收音 —— 与聊天分析面板的麦克风是同一条交互。手指上滑超过阈值（56px）整体变红、提示换「松手取消」（回落到阈值内恢复发送态）。**松手（未上滑）直接发送**：先走一遍仿真转写（/mock/speech/recognize），转写并入提问框里的文字，随即走 sendFreeChat —— 发送内容 = 文字（含转写）+ 已选截图，结果结构仍由快捷栏决定（「帮我回」→ 聊天分析，其余 / 未选 → AI通用回复），接着「AI 分析过渡页」→ 生成中 → 打字机输出，这一页收起',note:'两个入口的分工：**键区在下面**（键盘激活、框里停着光标）时语音只能按那颗语音按钮 —— 输入框占位此刻写「输入问题」（不再提「按住说话」），长按框留给编辑 / 选字；**图片选择器展开**时按住框与按按钮都行（占位写回「输入问题或按住说话」）。与「按住说话 · 语音转写」共用同一条遮罩与同一套上滑取消逻辑，区别只在入口与去向（面板麦克风 → 语音追问；问AI 页的这条 → 连同附图与快捷栏选择直接发送）；「设备权限 › 麦克风」关着时按住不响应。按住输入框与「点框收起图片选择器」互不打扰：短按照常聚焦 / 收起选择器，按住才转语音'},
    {id:'kb-full-access',group:'键盘权限与登录',name:'键盘完全访问引导页',route:'键盘 › 整页覆盖层（从下往上弹出 · 权限引导）',trigger:'键盘被唤起（点宿主输入框把收起的键盘唤回 / 启动即常驻（键盘已启用时）/ 左栏打开「开启键盘」/ 左栏关掉「键盘完全访问」/ 切到需要授权的平台）时，键盘侧没有完全访问权限 —— iOS 叫「允许完全访问」、鸿蒙叫「完整访问」，Android 系统上该权限默认开启、不弹这一层。它是键盘唤起的第一道检查，通过之后才轮到登录检查（见同组三条登录页）',desc:'键盘侧没有完全访问权限时的引导页，键盘一被唤起就立刻弹出：从下往上滑入、**盖住整个键盘区域**（菜单栏 / 键区 / 底栏一并盖住；键盘高度不额外变化，就是常规键盘那一块）。面板自上而下四段：① **顶条**（与键盘菜单栏同高）—— 底色与下方主体完全一致的浅灰白、**不显示任何文字**，只在最右侧放一枚圆形叉号（= 关掉这一层、回到键盘页，键盘继续可用）；② **标题**「开启[允许完全访问]，AI 帮你回复」（鸿蒙端按系统叫法写成「[完整访问]」）居中排在引导图上方；③ **引导图** —— 居中一张白色圆角卡片（柔和投影），卡片里是**两张设置操作引导图的轮播**（一轮 6 秒、每张约 3 秒，交叉淡入淡出 + 上下小幅位移，纯 CSS 动画）：第一张画系统设置列表（Siri / 搜索 / 通知 / 无线数据 / 键盘，逐行小图标 + 名称 + 右折角箭头），一枚红色箭头点着底部的「键盘」行（该行浅灰高亮）；第二张画键盘详情页（顶部「LoveCo 键盘」页名行 + 白卡里「LoveCo 键盘」开关开着、「允许完全访问」开关关着 + 一行灰字说明），红箭头旋转 90° 后点着那颗权限开关；卡片下面是蓝底白字的「去开启」按钮（34px 高、圆角 10px、左右各 20px 内边距）；④ **平台底栏**（kb-navbar，Android 不渲染，面板直接铺到屏幕底边）',note:'两张引导图在真机上是系统设置截图，这里按截图结构用 CSS 画出（不引位图，窄机上也清晰；鸿蒙端共用同一套图，只把权限名与列表行名按系统叫法换掉）。「去开启」= 仿真「去系统设置开启完全访问」（复用左栏同一条判定：把 permissions.keyboard 置成已开启），随后接着做登录检查 —— 未登录就顺势弹出键盘内登录页，都满足才回键盘；右上角叉号 = 关掉这一层、回到键盘页（权限仍未开 —— 收起键盘后下次唤起会再弹一次），Esc 与它同一条出口；点宿主聊天区域收起键盘也会一并收起它'},
    {id:'kb-login-one-tap',group:'键盘权限与登录',name:'键盘内登录 · 本机号一键登录',route:'键盘 › 整页覆盖层（从下往上弹出）',trigger:'键盘被唤起的**前置检查走到第二环**（点宿主输入框把收起的键盘唤回 / 启动即常驻 / 左栏关掉「登录状态」开关）：完全访问权限已开（没开的话先弹「键盘完全访问引导页」）且未登录，并且「设备权限 › 蜂窝网络」打开（视为已插卡且有蜂窝网络）',desc:'未登录时的登录页，键盘一被唤起就立刻弹出：从下往上滑入、覆盖整个键盘 UI 区域（菜单栏 / 键区 / 底栏一并盖住），**高度与键盘保持一致**（常规 250px，不额外拉高整块键盘；内部按这条横带重排 —— 按钮 / 输入框取紧凑档，协议行沉到最下）。皮肤固定浅色：整块通底淡蓝（2026-09-29 起改蓝并通体纯色，原为淡粉紫渐变）；**顶部一条键盘菜单栏那么高的「X 顶条」**（高度取 --lc-toolbar-height：常规 40px、矮窗口 210px 档 27px），X 靠右独占这一行、关闭本次登录（键盘恢复可用）—— 本机号 / 主按钮 / 「手机号登录」入口 / 协议行整体跟着往下移这一行（本机号不再自己留上边距）；顶条下是居中的大号本机号（号码旁不标「上次登录」）；下方整宽蓝色胶囊主按钮「本机号一键登录」（带同色柔光投影）—— **未勾选协议时点它不静默无反应，而是让底部协议行左右抖一下**（提示先勾选：只抖一次、颜色不变、也不弹任何提示条）；再往下居中的「手机号登录」圆角方块入口（**38px 见方 / 圆角 11px** 的浅灰底，矮窗口 33px；深色描边手机图形 + 灰色小字，点它切到手机号验证登录形态）；底部一行协议勾选（圆形勾选框 + 十一号灰字，协议名是同一层里可点的深色文字按钮 —— 点开键盘内协议正文页，见「键盘内登录 · 协议正文」）。勾选后点主按钮即模拟登录成功，先弹出「登录成功」提示、约 1 秒后收起登录层回到键盘；点 X 则保持未登录（下次唤起键盘再弹一次）',note:'本机号取 state.phone（仿真「上次登录」号，默认 138****8000，号码旁不再显示「上次登录」小标），一键登录走 POST /v1/auth/one-tap/login 仿真接口（不调用运营商 SDK）；协议名可点开键盘内协议正文页（kb-legal）—— 与主 App 登录页的协议链接同一个数据源（legal-data.js）；设计图里的「登录 LOVEKEY · 添加聊天人设到键盘」标题、微信 / Apple 登录入口按要求不呈现'},
    {id:'kb-login-sms',group:'键盘权限与登录',name:'键盘内登录 · 手机号登录',route:'键盘 › 整页覆盖层（从下往上弹出）',trigger:'同上，但「设备权限 › 蜂窝网络」关闭（无卡 / 未开蜂窝网络）；或在一键登录页点「手机号登录」切过来（就地换表单，不重放滑入动画）',desc:'同一登录层的短信验证码形态（高度同样与键盘一致、从下往上滑入）：顶部同样的浅色底与右上角 X，左上第一行是**页名「手机号登录」**（小字，与 X 同排）；往下两张浅灰胶囊输入框（**46px 高 / 15px 字**，矮窗口档 41 / 14；页名与第一张框之间留一截空白、两张框整体比原先靠下）—— 「请输入手机号」（打开即预填仿真测试号 13800138000，可改）与「请输入验证码」（框内右侧嵌一颗白底紫字胶囊「获取验证码」，发送后变「重新获取」）；再往下整宽胶囊「登录」按钮 —— 手机号 / 验证码没填齐时是淡紫禁用态（设计图里就是这一档），填齐后变实色可点；**按钮下面是协议勾选行**（圆形勾选框 + 十一号灰字：我已阅读并同意用户协议、隐私协议 —— 2026-09-29 需求起链接文案用简称，不带运营商认证协议；两份协议名同样可点开键盘内协议正文页）。未勾选协议时点「登录」**不静默无反应，而是让协议行左右抖一下**（与一键登录同一套提示）；勾选后点登录即模拟成功 —— 先弹「登录成功」提示、约 1 秒后收起登录层回键盘，号码随之成为本机号',note:'仿真约定与主 App 登录页一致：点「获取验证码」走 POST /v1/auth/sms/send，发码后自动把验证码填成 123456（省一次手输），登录走 POST /v1/auth/sms/login；格式不对 / 验证码错误时点「登录」无反应（没有任何提示 —— toast 已整体删除）。协议勾选与一键登录共用同一份状态（在一键登录页勾过，切过来也是勾上的）。设计图里的「收不到验证码？联系客服」一行按要求不呈现'},
    {id:'kb-login-done',group:'键盘权限与登录',name:'键盘内登录 · 登录成功',route:'键盘 › 整页覆盖层（登录成功的提示）',trigger:'一键登录 / 手机号验证登录成功后的约 1 秒内（本列表点入为静态查看，不设收起定时器）',desc:'登录层的收尾形态：整条键盘高度的浅色底（同一块淡蓝底）上只剩居中的一枚强调色圆勾 + 「登录成功」（15px 深色字），对勾带一记轻微放大淡入（0.28s）；提示停留约 1 秒后由 app.js 收起登录层、回到键盘页面（此刻状态已变成已登录）。它不是全局轻提示 —— toast 组件早已整体删除，这一记提示只是登录层自己的第三个形态，仍然只占键盘那一条',note:'停留时长是 app.js 的 KB_LOGIN_DONE_MS（1000ms），收起走 closeKbLogin()（连定时器一起摘）；期间按 Esc 或收起键盘也会立刻收掉'},
    {id:'kb-legal',group:'键盘权限与登录',name:'键盘内登录 · 协议正文',route:'键盘 › 整页覆盖层（协议正文 · 从下往上弹出）',trigger:'键盘内登录层的协议勾选行里点任一协议名（用户协议 / 隐私协议 / 中国联通认证服务协议）；或从页面列表本条目静态查看（按真实链路摆好一键登录层后再打开「用户协议」那份正文，X 一关即回登录层）',desc:'登录层协议名的落点：把主 App 协议正文页里那份协议全文**缩到键盘这一条高度里**滚动浏览 —— 仍是键盘那一块（常规 250px / 矮窗口 210px，不拉高键盘），从下往上滑入、压在登录层之上，配色与登录层同一套固定浅色（--kbl-*，不跟随键盘的浅色 / 深色外观）。结构自上而下两段：① **顶条**（键盘菜单栏那么高 --lc-toolbar-height：常规 40px / 矮窗口 27px）—— 左边一行小字协议名（13px / 矮窗口 12px，超长省略），右边一枚圆形 X；② **正文区** —— flex 吃满余高、**在键盘高度内纵向滚动**翻完全文（pre-wrap 保留分段，11.5px / 行高 1.8，矮窗口 10.5 / 1.75，深灰 #4C4D57）。三种形态按 state.kbLegal 换正文：用户协议（链接简称，正文页标题《用户协议》）、隐私协议（简称，正文标题《隐私协议》）、中国联通认证服务协议 → 同名仿真文本（与主 App 协议正文页同一个数据源 legal-data.js，逐字一致 —— 链接文案的简称改自 2026-09-29 需求，key 与正文都没动）。X / Esc 只关掉本页回登录层，协议勾选状态不动',note:'真机上运营商认证协议由运营商页面展示，这里就地看（该份为按真机场景补写的仿真文本，legal-data.js 里标 simulated；主 App 的协议正文页也随之多出这一条 —— 2026-10-04 又加入《用户注销协议》，协议快照现共 8 份）；协议正文页只为登录层的协议名服务 —— 收起键盘 / 关闭登录层（kbReset / closeKbLogin）时随登录层一并收起'},
    {id:'kb-zh-qwerty',group:'键盘布局',name:'26 键中文键盘',route:'键盘 › 按键区',trigger:'键盘设置页选「全键盘拼音」，或在英文键盘按「中/英」切回中文',desc:'三排字母 + 底行「123 / ，/ 空格 / 中英 / 发送」；键符恒为大写，输入进拼音组合',note:'与九宫格共用同一块键区，切换布局高度不跳'},
    {id:'kb-en-qwerty',group:'键盘布局',name:'26 键英文键盘',route:'键盘 › 按键区',trigger:'中文键盘底行按「中/英」切换',desc:'键位同 26 键中文但键符默认小写（按 ⇧ 变大写）、底行标点键为「.」；按键直接上屏，没有联想词',note:'英文键盘没有第二套布局，设置页选布局会直接切回所选的中文键盘'},
    {id:'kb-t9',group:'键盘布局',name:'中文九宫格键盘',route:'键盘 › 按键区',trigger:'键盘设置页选「九宫格拼音」，或在 26 键中文按地球键',desc:'左列五颗标点 + 3×3 字母块（只画字母不带数字）+ 右列 ⌫ / 换行 / 发送 + 底行「123 / 空格 / 中英」',note:'字母键按 T9 数字映射输入'},
    {id:'kb-t9-typing',group:'键盘布局',name:'九宫格 · 打字中',route:'键盘 › 按键区（打字态）',trigger:'九宫格按任意数字键进入',desc:'数字串推出拼音字母组合：左列换成拼音组合列、`@#` 变为分词键（插入分词符）、底行补「符号」键；顶部为候选词栏',note:'与候选词栏 · 打字中是同一状态的键区视角'},
    {id:'kb-numbers',group:'键盘布局',name:'数字键盘（123）',route:'键盘 › 按键区（数字层）',trigger:'字母层底行按「123」',desc:'左列五颗符号 + 3×3 数字 + 右列 ⌫ / 空格 / 发送 + 底行「返回 / 0 / .」；数字固定九宫格，与语言、布局无关',note:'按键直接插入字符，不进打字态'},
    {id:'kb-symbols',group:'键盘布局',name:'符号键盘',route:'键盘 › 按键区（符号层）',trigger:'九宫格 / 数字层左列末键「符号」，或九宫格 `@#` 键',desc:'左列四个分类（常用 / 中文 / 英文 / 表情）+ 右侧 4×4 符号面板（1px 网格线分隔）+ 底行「返回 / ，/ 空格 / 中英 / 发送」',note:'分类只换右侧 16 个符号，仅存在于当前页面内存'},
    {id:'partner-manager',group:'聊天对象',name:'聊天对象管理页',route:'键盘 › 整页覆盖层',trigger:'键盘菜单栏左侧的头像按钮',desc:'覆盖整个键盘区域（不覆盖宿主输入栏）：首行「不选择」（**2026-10-06 晚些需求起该行头像也用默认头像插画 AV.chat**，与下面对象行同一张），其余为对象列表（**顺序按最近操作在前** —— 新建的对象排在列表最前，编辑过的对象保存后也从原位提到最前，其余对象保持原有相对顺序）；单击行即选中并退出，左滑时编辑 / 删除从行右侧滑入、盖在行内容上（头像与名称保持可见，删除不二次确认、也不弹提示 —— 行收起后直接从列表消失并落库，退出再进来不会恢复）',note:'新建 / 编辑在键盘模式下打开「聊天对象编辑面板」（kb-partner-editor，新增 / 编辑两种形态各占一条）；主 App 形态仍用弹层'},
    {id:'partner-manager-empty',group:'聊天对象',name:'聊天对象管理页 · 空列表',route:'键盘 › 整页覆盖层（空态）',trigger:'列表里没有对象时（把对象全部删光）',desc:'「不选择」行下方显示空态文案：「还没有聊天对象，点右上角「新建」添加。」—— 文案只做水平居中、紧跟在「不选择」行下方（上方 24px 间距，剩余空白一律沉在下方，不做垂直居中）；本条目点入即为该空态（只影响渲染、不动对象数据），真实把对象删光后也是同一形态',note:'与「聊天对象管理页」是同一覆盖层的空态分支；「不选择」行始终在'},
    {id:'kb-partner-editor',group:'聊天对象',name:'新增聊天对象',route:'键盘 › 覆盖层（键盘区域上半）',trigger:'聊天对象管理页右上角「新建」',desc:'聊天分析面板同款深色皮肤，页面分上下两部分：上半是表单、下半是键盘（键盘整块仍拉高到手机屏幕三分之二；下半键盘的菜单栏只留最右侧的「键盘设置」入口 —— 对象切换与相册不出现，键区与底栏跟平时一致，键区打字时候选词栏照常顶上来）：标题栏压成一行，表单是横向一行 —— 头像在左（小一号虚线圆槽显示「上传头像」，点击进图片选择器的头像模式 —— 单选、底部「确定」），备注名 / 关系阶段两行在右（左标签 + 右控件）；打开面板光标默认落在备注名、键区打字直接写进备注名（拼音带下划线、候选词替换与宿主输入框同一套）；键区右下角的功能键在这个场景显示「确定」—— 按下先兜底落库再回聊天对象管理页（面板里不放确定按钮，标签见 enterKeyLabel、动作见 closeKbEditor）；称呼 / 关系阶段 / 头像一有变化即静默保存，关闭面板时兜底落库（对象随之排到聊天对象列表最前）',note:'性别与备注信息已移除；与「修改聊天对象」是同一面板（kb-partner-editor）的两种形态；头像模式只列带位图的图片（插画样例），聊天截图卡没有位图当不了头像；进头像选择器时本面板收起（选择器铺满整个键盘区域），选择器关闭 / 确定后再弹回来；开管理页 / 开选图选择器前同样先收起本面板（dismissKbEditor，先兜底落库），选择器关闭 / 确定后再弹回来；点「键盘设置」是例外 —— 本面板不收起，设置页只覆盖下半键盘区域、面板留在上半（在新增 / 修改页面里切键盘形态时上方区域不消失）'},
    {id:'kb-partner-edit',group:'聊天对象',name:'修改聊天对象',route:'键盘 › 覆盖层（键盘区域上半）',trigger:'聊天对象管理页对象行左滑「编辑」',desc:'与「新增聊天对象」同一面板的编辑态（同样只占键盘区域上半；下半键盘菜单栏只剩「键盘设置」入口）：标题「编辑聊天对象」，头像在左 / 备注名 · 关系阶段在右，预填对象当前值（头像槽标注「更换头像」）且光标默认在备注名末尾、键区打字直接写进备注名，键区右下角的功能键显示「确定」（按下落库并回聊天对象管理页）、改动即静默保存、关闭时兜底落库（对象随之排到列表最前）；不再展示「删除这个对象」（删除只走列表左滑）',note:'保存保留面板中未提供的性别 / 备注信息原值'},
    {id:'photo-picker-avatar',group:'聊天对象',name:'键盘选择器 · 选择头像',route:'键盘 › 整页覆盖层（从下往上弹出 · 头像模式）',trigger:'新增 / 编辑聊天对象面板点头像槽',desc:'同一选择器的头像模式：标题「选择头像」、候选是 12 张模拟头像 + 带位图的插画样例（聊天截图卡没有位图当不了头像）、方形磁贴（与裁出的方头像同规格）、单选（选中画 ✓，再点取消 / 点别的替换），底部按钮「确定」（未选时禁用）',note:'与「键盘选择器 · 选择聊天截图」是同一面板（kb-photo-picker）的两种形态；确定后把图居中裁成方形存进编辑面板草稿，X / Esc 同样返回编辑面板'},
    {id:'kb-settings',group:'键盘设置',name:'键盘设置页',route:'键盘 › 整页覆盖层',trigger:'键盘菜单栏最右侧的设置图标（对象编辑面板打开时菜单栏只留这个入口）',desc:'「选择你喜欢的中文键盘」：九宫格拼音 / 全键盘拼音两张选项卡，选中即收起覆盖层并切换键区（键区形态见「键盘布局」组）',note:'切换的是中文键盘的布局；与聊天对象管理页互斥；对象编辑面板打开时只覆盖下半键盘区域（上方编辑区域不消失），收起 / 选完布局后仍在新增 / 修改页面'},
    {id:'photo-picker',group:'聊天分析',name:'键盘选择器 · 选择聊天截图',route:'键盘 › 整页覆盖层（从下往上弹出）',trigger:'键盘菜单栏的相册图标（相册访问权限为「完整访问」时）',desc:'三列聊天截图网格（3:4 磁贴，一屏可见四行），最多选 3 张（蓝色圆形序号按选择顺序编号，再点取消），右下角「立即分析」把截图加入 AI 输入并直接生成；顶部是标题「选择聊天截图（最多3张）」+ 灰色副标题「按时间从前到后排序，分析更到位」+ 右上角 X',note:'面板固定深色（设计图即深色场景），键盘拉高到手机屏幕三分之二；打开前先验相册访问权限（左栏「设备权限 › 相册访问权限」），不是完整访问就换成另两种引导形态（见下两条）；编辑面板开着时打开，面板先收起、关闭选择器再弹回编辑面板'},
    {id:'photo-picker-limited',group:'聊天分析',name:'键盘选择器 · 有限相册权限',route:'键盘 › 整页覆盖层（从下往上弹出 · 权限引导条）',trigger:'「设备权限 › 相册访问权限」为「有限访问」时，点键盘菜单栏的相册图标',desc:'同一选择器的有限授权形态：标题栏下面多一条整宽引导条（整条 28px 高，比标题栏小一档）—— 左侧白色 11px 文案「开启照片[完全访问]，操作更快捷～」，右侧一颗淡紫胶囊「开启权限」（22px 高、圆角 11px、10px 白字，悬停提亮），底纹比面板深色略浅一档、与网格拉开层次；引导条下仍是三列网格，但只有用户授权过的那张截图可读（原型里用样例首张模拟），右下角「立即分析」照常。点「开启权限」= 仿真去系统设置开启完全访问（复用左栏同一条 photos:full 动作，权限置成完整访问）后就地切成正常选择器形态',note:'与「键盘选择器 · 选择聊天截图」是同一面板（kb-photo-picker）的三种权限形态之一：面板壳 / 弹出方式 / 底部平台底栏都不变，只换内容'},
    {id:'photo-picker-denied',group:'聊天分析',name:'键盘选择器 · 相册权限引导页',route:'键盘 › 整页覆盖层（从下往上弹出 · 权限引导页）',trigger:'「设备权限 › 相册访问权限」为「关闭」时，点键盘菜单栏的相册图标',desc:'同一面板完全没有相册权限的形态：标题栏保留（「选择聊天截图（最多3张）」+ 右上角 X，副标题收起），标题栏与平台底栏之间的整块区域换成居中引导 —— 第一行白色 15px「相册权限未开启，无法访问」，其下灰色 11px「开启照片[完全访问]，体验快捷分析～，操作更快捷～」，再下一颗淡紫胶囊「去开启权限」（34px 高、圆角 17px、白字，左右各 28px 内边距）；不放网格、也不放右下角「立即分析」。点「去开启权限」与引导条那颗按钮同一条动作（photos:full，仿真去系统设置开启完全访问），权限置成完整访问后原地变成正常选择器',note:'与「键盘选择器 · 选择聊天截图」是同一面板（kb-photo-picker）的三种权限形态之一；这一形态不渲染平台底栏（与设计图一致：底栏位置是纯深色留白），出口仍是右上角 X / Esc'},
    {id:'kb-scan',group:'聊天分析',name:'AI 分析过渡页',route:'键盘 › 整页覆盖层（过渡动画）',trigger:'键盘选择器点「立即分析」后；或聊天分析面板上按住麦克风说完一句指令（语音追问）松手后',desc:'顶部「正在分析中…」+ 取景框包文档图标 + 白色辉光横线上下往返扫描，约 1 秒后原地切入聊天分析面板 —— 截图分析与语音追问两条链路共用这一页',note:'Esc 可跳过；本列表点入后不设自动切换定时器，便于静态查看'},
    {id:'chat-loading',group:'聊天分析',name:'聊天分析 · 生成中',route:'键盘 › 整页覆盖层（聊天分析面板）',trigger:'任一 AI 生成路径（立即分析 / 重新生成 / 语音追问）发起后',desc:'四张骨架占位卡（呼吸动画错开半拍、卡间留白），请求在后台进行 —— 简报不在加载态出现，所以两种结果（截图分析 / 语音追问）在这一态长得一样',note:'面板覆盖整个键盘区域、固定深色；生成中关闭面板即取消本次生成'},
    {id:'chat-stream',group:'聊天分析',name:'聊天分析 · 输出中',route:'键盘 › 整页覆盖层（聊天分析面板）',trigger:'请求成功返回后自动进入',desc:'打字机按页面自上而下的顺序逐段输出：关系简报（先「关系阶段 / 聊天氛围」一行、再正文）→ AI 回复正文 → 回复思路 → 建议卡 1→2→3（每张先策略行再回复）；本次结果缺哪一块就跳过哪一块（语音追问的结果见「AI通用回复」），正在输出的段末带闪烁光标、内容区自动滚到底',note:'点入列表后打字机会真实播完并停在「已完成」形态'},
    {id:'chat-done',group:'聊天分析',name:'聊天分析 · 已完成',route:'键盘 › 整页覆盖层（聊天分析面板）',trigger:'打字机输出完毕后自动进入',desc:'标题旁「内容由AI生成」，三张思路卡整卡可点（点中淡紫描边并把回复带入宿主输入框），底部浮出麦克风 / 重新生成 / 发送三个悬浮按钮（**「发送」按宿主输入框有无内容亮起或置灰** —— 输入框为空时是灰底灰字、不可点，选中的思路卡会把回复带进输入框，它随之高亮）',note:'**这一页上的语音输入都当语音追问**：面板麦克风、宿主输入栏的语音圆钮与框内麦克风（iOS 底栏语音键被面板盖住）松手后都走「AI 分析过渡页 → 生成中 → AI通用回复」，不再把转写写进输入框；关闭面板即收起并清掉结果，回到干净键盘页'},
    /* 安全拦截的失败态：请求被 400 拒答时面板不收起、停在拦截提示上（见 generate() 的 catch） */
    {id:'chat-blocked',group:'聊天分析',name:'聊天分析 · 内容拦截',route:'键盘 › 整页覆盖层（聊天分析面板）',trigger:'任一 AI 生成路径（立即分析 / 重新生成 / 语音追问）发起后请求被安全策略拦下 —— 左栏「模拟 › 模拟安全拦截」打开，或本次输入命中敏感词（制造炸弹 / 色情视频 / 赌博网站 / 购买毒品）',desc:'请求被拦下面板不收起，加载态原地换成拦截提示：标题栏照旧（星光 + 聊天分析 + 右上 X），下方的整块内容区只有一组水平垂直居中的提示 —— 盾形图标（34px、淡紫描边、内有一枚感叹号）在上，13px 近白文案「检测到敏感词，AI拒绝回答」在下，切入时随面板一起入场（原地切换那次单独淡入上浮一小段）；不显示「内容由AI生成」小标，骨架卡 / 简报 / AI 回复 / 建议卡与底部悬浮按钮一概不渲染；「AI 分析」过渡页播放中被拦下时过渡直接切到这一态。X / Esc 关闭即回干净键盘页（本次输入一并清掉）',note:'只有安全拦截这一种失败停在这里 —— 断网 / 超时 / 服务异常仍是静默关面板回键盘页；拦截不扣积分；本列表点入为静态查看（顺带把左栏「模拟安全拦截」置开，不落库）'},
    /* 语音追问的结果（同一条链路、同一块面板，AI 按用户那句话重新生成；
       原「AI 回复 · 重新生成建议 / 请教问题」两种结果形态已删除，页面列表只登记这一种通用回复） */
    {id:'chat-voice-general',group:'聊天分析',name:'AI通用回复',route:'键盘 › 整页覆盖层（聊天分析面板）',trigger:'面板停在「聊天分析 · 已完成」/「AI通用回复」时按住任一语音入口（面板麦克风 / 输入栏语音圆钮 / 框内麦克风）说一句指令（仿真里固定是「评价一句」那一档，见 VOICE_QUERIES —— 原「模拟 › 语音指令」下拉 2026-10-06 已删除）松手后：转写 → AI 分析过渡页 → 生成完毕',desc:'语音追问后 AI 重新给出的回复 —— 用户对着麦克风补一句话，AI 按它重新生成：**整页只有一张关系简报卡（紫底）**，AI 回复与回复思路都并进卡内、按 markdown 排版（内容自带章节标题，不再有「AI 回复 / 回复思路」的固定小标题）；没有建议回复。这张卡**不写分析正文**（不再有一段独立的简报文字），卡内自上而下就是 markdown 的三节：**「整体评价」**（✅⚠️ 两条点评 + 解释段）→ 分隔线 → **「分析对话节点」**（左侧竖线的引用块摆出「你：… / 她：…」两句对话 + 分析段）→ **「优化建议」**（1/2/3 有序列表：轻撩款（推荐）/ 轻松幽默款 / 温柔稳妥款，每项名下缩进一行可直接发送的话）；底部三颗悬浮按钮常驻，「发送」默认灰底灰字不可点（宿主输入框有内容才亮）；打字机逐段挂载：整体评价 → 分析对话节点 → 优化建议',note:'markdown 渲染由 app.js 的 mdHtml() 完成 —— 认标题行、有序 / 无序列表（含项下缩进续行）、`> ` 引用块、`---` 分隔线、`**加粗**` 与 emoji，目前只有这一形态走它；卡内内容见 REVIEW_ANSWER / REVIEW_THINKING 两段 markdown 文案。这一页自身也是语音入口：再按一次麦克风（或输入栏语音圆钮 / 框内麦克风）仍走同一条链路，结果还是停在「AI通用回复」'},
    {id:'voice-hold',group:'语音输入',name:'按住说话 · 语音转写',route:'键盘 › 键盘区域上的蓝色毛玻璃遮罩',trigger:'按住聊天分析面板的麦克风按钮（或输入栏语音圆钮 / 框内麦克风、iOS 键盘底栏语音键）',desc:'按住即「录音」：浮出一块**与键盘区域同高**（与 .keyboard 同高、同贴底）的蓝色毛玻璃遮罩（自下而上渐隐、上缘与面板内容自然融合；键盘被面板 / 选择器撑到三分之二时整块面板都在遮罩里，干净键盘页正好罩住键盘本身），提示「松手发送，上滑取消」，一排蓝色波浪条起伏模拟收音；手指上滑超过阈值进入取消态（整体变红，见「按住说话 · 上滑取消」）',note:'松手（未上滑）都走 /mock/speech/recognize 仿真转写，去向按「说话时屏幕上停的是哪一页」分两种：**面板正停在已完成态**（「聊天分析 · 已完成」/「AI通用回复」两页）—— 面板麦克风 / 输入栏语音圆钮 / 框内麦克风都把这句话当作给 AI 的指令重新生成（AI 分析过渡页 → 生成中 → AI通用回复）；**干净键盘页 / 面板生成中**（含 iOS 底栏语音键）仍是把转写写进宿主聊天输入框。上滑后松手即取消。原「主 App 接力 · 语音」弹层已删除，本页替代它'},
    {id:'voice-hold-cancel',group:'语音输入',name:'按住说话 · 上滑取消',route:'键盘 › 键盘区域上的红色毛玻璃遮罩（取消态）',trigger:'按住说话时手指上滑超过阈值（56px）',desc:'同一遮罩的取消态：整体变红（波浪条与提示文字同步），提示从「松手发送，上滑取消」换成「松手取消」；此时松手直接收场，不转写、不写入任何内容',note:'与「按住说话 · 语音转写」是同一遮罩（.voice-rec 加 .cancel）的两种形态；上滑超过 56px 进入、回落到阈值内恢复发送态（就地切 class，波浪动画不重置）'},
    {id:'platform-ios',group:'系统外观',name:'平台外观 · iOS',route:'键盘 › 平台外观（?platform=ios）',trigger:'工作台「运行平台」切到 iOS，或本列表点入',desc:'顶部状态栏「药丸挖孔」（灵动岛）样式；键盘底栏是「地球 + 语音输入（按住说话）」两颗键',note:'三端外观差异另见「平台差异」表；切平台同时影响选图的接力文案等仿真行为'},
    {id:'platform-harmony',group:'系统外观',name:'平台外观 · 鸿蒙',route:'键盘 › 平台外观（?platform=harmony）',trigger:'工作台「运行平台」切到鸿蒙，或本列表点入',desc:'顶部状态栏「圆点挖孔」样式；键盘底栏左侧「地球」键（切换输入法）、右侧「小艺」星芒标识（纯装饰，不选不亮、点击无反应）',note:'三端外观差异另见「平台差异」表'},
    {id:'platform-android',group:'系统外观',name:'平台外观 · Android',route:'键盘 › 平台外观（?platform=android）',trigger:'工作台「运行平台」切到 Android，或本列表点入',desc:'顶部状态栏「圆点挖孔」样式；键盘底栏整条不渲染（Android 无此栏），覆盖层 / 选择器直接铺到屏幕底部',note:'三端外观差异另见「平台差异」表'},
    /* 键盘形态的付费引导：额度不足时盖住整个键盘区域（2026-09-28 起主 App 的购买走会员购买页，这一层回归键盘专属） */
    {id:'kb-paywall',group:'会员中心',name:'会员开通覆盖层（键盘）',route:'键盘 › 整页覆盖层（额度不足）',trigger:'键盘模式下发起 AI 生成（立即分析 / 重新生成 / 语音追问 / 键盘发送）时额度不足 —— 左栏「模拟 › 模拟试用额度耗尽」打开（积分清零且非会员）。本列表点入为静态查看（现场把额度置成耗尽，不落库）。**2026-09-28 起主 App 不再弹这一层**：主 App 额度不足 / 键盘安卓·鸿蒙跳转都改落**会员购买页**（APP_PAGES 的 purchase / purchase2-copy 两条目 —— 「我的」页的会员卡片 2026-10-05 起落第二个购买页 purchase2，该页 2026-10-06 已按需求整页删除、卡片改落 purchase2-copy）',desc:'额度不足时打开这一层：铺满**整个键盘区域**（菜单栏 / 键区 / 底栏一并盖住；键盘高度不额外拉高，就是常规键盘那一块 250px / 矮窗口 210px）、从下往上滑入。结构自上而下：① 右上角一枚圆形 X（只收起这一层回键盘，额度仍是 0 —— 再发起生成还会弹）；② 两行居中标题「成为LoveCo会员，/ 无限次使用AI功能～」（16px 深墨字，两行等宽居中排，标题上方**不再放**「3000 万+用户选择」「第 1 名」那两块徽章）；③ 三档商品卡**横向等分并排**（永久会员 ¥128 / 周会员 ¥9.9 / 季度会员 ¥98，卡内自上而下：12px 灰档位名 → 20px 加粗现价（¥ 比数字小一档）→ 11px 灰字划线原价 ¥576 / ¥48 / ¥128），选中的那张浅紫底 + 2px 紫描边、其余白底浅灰描边，点卡片即切换选中档位（默认永久会员）；④ 整宽蓝色胶囊「立即解锁」（不是钉在底栏上方；**整颗持续一跳一跳**（放大缩小：1.4s 一个来回、scale 1 ↔ 1.055 + 蓝色投影同步加深，2026-09-28 需求定稿），引导点击；右上角悬一枚红色小标，**文案随档位变**：永久会员「一次性买断」/ 周会员「畅享 7 天」/ 季度会员「畅享 90 天」）；⑤ **协议行收在按钮下方、首屏可见** —— 10px 灰字「我已阅读并同意《会员协议》、《续费协议》」，**不带勾选框**（已按需求去掉，购买不再前置勾选），两份协议名都是同一层里可点的深色文字按钮：点开键盘内协议正文页 kb-legal，压在这一层之上、X 一关即回本层；**永久会员那一档只留《会员协议》**（一次性买断、不涉续订）；⑥ 平台底栏（kb-navbar，Android 不渲染、面板直接铺到屏幕底边）。**协议行收回首屏、iOS 的周 / 季度档整层可滚**（2026-09-29 两次需求：先把沉底的协议行收紧到首屏；同日晚些又按设计图把说明段加了回来 —— 周 / 季度档在协议行下方压一段 10px 浅灰小字**自动续订说明**（照设计图 1:1：iTunes 自动续订 / 到期前 24 小时扣费 / 取消方式 / 试用期规则，只在 iOS 渲染），超出键盘首屏、主体列是这一层唯一的滚动容器，往上滚一段才露出；永久会员档与安卓 / 鸿蒙没有这段、整层一屏放下（实测零溢出）。续订条款全文仍可点《续费协议》看）。**未勾选协议就点「立即解锁」的拦截已随勾选框一并去掉**：点它的落点按平台 / 形态分两路（2026-09-28 需求）—— **iOS**：不跳转也不当场到账，就地弹出 **iOS 系统支付框**（App Store 内购确认，深色系统弹窗、盖住整机，见同组「iOS 系统支付框」条目），在支付框里确认后才走完仿真支付、会员当场生效、两层一起收起；**安卓 / 鸿蒙的键盘形态**：跳转到主 App 的**会员购买页**（gotoAppPurchase —— 切到主 App 形态、直接落 purchase 页里再购买；2026-09-28 起不再就地打开本层）。本层在主 App 形态已不再出现，安卓 / 鸿蒙跳走后由购买页的一键到账（purchase 动作）完成支付',note:'商品取 PLANS（永久 ¥128 / 周 ¥9.9 / 季度 ¥98，均带划线原价、kind 一律 member）—— 与主 App 会员购买页**共用这一张表与同一个选中态**（原「键盘内三档 vs 主 App 月度 / 年度 / 积分」两套分开卖的做法已随主 App 会员页删除作废；积分档就此不存在）；设计图里的两块徽章（3000 万+用户选择 / 第 1 名）与永久会员卡上的「告白季特惠」标签按要求不呈现；皮肤固定浅色（顶部淡紫渐变向下渐隐到白），不跟随键盘的浅色 / 深色外观；Esc 与 X 同一条出口；「立即解锁」按平台分两路（iOS 弹系统支付框、安卓 / 鸿蒙跳主 App 会员购买页，见 desc 与同组「iOS 系统支付框」条目）；协议行首屏可见；iOS 的周 / 季度档协议行下方压着自动续订说明、要滚动才看得到（2026-09-29 二次需求按设计图恢复；永久档 / 安卓 / 鸿蒙没有这段、整层一屏放下），续订条款全文仍可点《续费协议》看；《续费协议》只对周 / 季度两档出现，永久会员档不显示'},
    /* iOS 系统支付框（kb-ios-pay，2026-09-28 按需求补入）：iOS 上点会员开通层的「立即解锁」
       就地弹出的 **App Store 内购确认弹窗**（系统级、铺满整机）—— 不属于键盘、也不属于 LoveCo
       的界面，照参考截图 1:1；单独一条便于从列表跳进静态查看。 */
    {id:'kb-ios-pay',group:'会员中心',name:'iOS 系统支付框（App Store 内购确认）',route:'键盘 / 主 App › 系统级弹层（挂在手机根节点、铺满整机；iOS 平台专属）',trigger:'iOS 平台下点「立即解锁」就地弹出（2026-10-06 起会员购买页的主按钮同为这句 —— 第二页原「购买 xx 会员」已统一）（键盘的会员开通覆盖层与主 App **会员购买页**上都会弹；正常链路里由额度不足打开键盘付费引导层 / 「会员中心」行与「我的」页会员卡片打开会员购买页「会员购买页 · 新」/ 主 App 额度不足同样落那一页，见同组两条目）。本列表点入＝现场摆成「iOS + 额度过期 + 在会员开通层里点过『立即解锁』」那一刻（平台切 iOS 落库，额度不落库）',desc:'iOS 上点会员开通层的「立即解锁」**不跳转、也不当场到账**，就地弹出这层系统弹窗（App Store 内购确认，照参考截图 1:1）—— 弹窗里确认后才走完仿真支付、权益到账。**功能**：① 点底部确认区（真机是双击侧边按钮）= 确认支付：走完仿真支付（purchase 链路）、会员当场生效，支付框与下面的会员开通层一起收起回原处（键盘形态回键盘、主 App 形态停原页）；② 点右上角圆形 X = 取消购买：只收起支付框、回会员开通层（额度仍是 0，可再点一次）；③ 点蒙层不关闭（与 iOS 的系统弹窗一致）；试付进行中两个出口都不可点。商品随选中档位变：永久档「**Lifetime** / One-time charge」（一次性买断、即截图那一档）、周「**Weekly** / Auto-renewable · 7 days」、季度「**Quarterly** / Auto-renewable · 90 days」、月度「**Monthly** / Auto-renewable · 30 days」（月度档 2026-10-05 起短暂挂在第二个购买页、**2026-10-06 晚些需求起已改成周档** —— 键 week 走上面「Weekly · 7 days」那行，见 purchase2-copy 条目（purchase2 页 2026-10-06 已删）），价格取**当前结算档位**（ctx.checkout —— 第一个购买页 / 键盘付费层取 PLANS、「会员购买页 · 新」取 PLUS_PLANS，见 checkoutPlan），统一格式化成两位小数（¥128.00 / ¥9.90 / ¥98.00 / ¥48.00）。**设计**：系统级弹窗（不属于键盘、也不属于 LoveCo）—— 挂在手机根节点上、铺满**整个手机屏**（含键盘与宿主 App），层级压过按住说话遮罩，是手机内的最高层。**固定系统深色外观**（不跟随键盘的浅色 / 深色皮肤）：整屏盖一层黑色半透明蒙层；屏幕右上角两行白色提示「**Double Click / to Pay**」（iOS 的「双击侧边按钮」提示，浮在蒙层之上、带文字投影）；底部一块深色 sheet —— 占屏幕下方约三分之二（min-height 66%）、顶部 18px 大圆角 + 向上投影，自上而下：① 大标题「**App Store**」（24px 粗体白字）+ 右上角深灰圆形 X（32px）；② 商品卡（深灰 #2C2C2E 圆角 14px）：LoveCo 图标（52px 圆角 12px，取 assets/brand）+ 档位名（16px 600 白字）+ 一行灰字「LoveCo 键盘-恋爱聊天键盘&AI智能聊天回复神器」+「12+」评级小框 + 一行灰字「In-App Purchase」+ 下半价格（19px 600 白字）与计费说明（12px 灰字）；③ 卡外一行灰字「Account: 649924325@qq.com」（仿真 Apple 账户，与 App 内登录无关）；④ 底部居中的确认区（沉在 sheet 底边之上）：侧边按钮指示图形（46px：蓝圆底 + 白色手机轮廓 + 右侧边按钮 + 指向它的箭头）与「Confirm with Side Button」文字（13px 灰字）。弹入动画：蒙层淡入（0.24s）+ sheet 从底部滑入（0.34s cubic-bezier(.32,.72,0,1)），只在打开那一次渲染播放',note:'只在 iOS 出现：安卓 / 鸿蒙的键盘形态点「立即解锁」不弹它、而是跳转主 App 的会员页（见「会员开通覆盖层」条目），安卓 / 鸿蒙的主 App 形态则一键到账；Esc 与 X 同一条出口（取消购买、不到账）；「Account」与商品名映射（Lifetime / Weekly / Quarterly）是这层弹窗的仿真数据（组件 MARKETING 表 + PLANS）；层级 50（z-index），是手机内最高的一层'},
      ];
  const APP_PAGES = [
    {id:'home',group:'首页与我的',name:'首页',route:'/home',trigger:'主 App 底部 Tab 第一项「首页」；登录成功后也落在这里（进入主 App 的状态检查链 —— 键盘权限 → 键盘完全访问 → 登录状态 —— 都通过才停在这一页，见 appEntryGuards）',desc:'**2026-10-05 按设计图重做的深色首页**（原「空白模板」形态作废；设计图里的「帮你回」模块与「好用，也要顺手」小节标题（含右侧「设置 ›」）按需求不做，「进入体验台」下面那句「已就绪，聊天时切换即可用」也不做 —— 勿当遗漏补回）。**功能**：三块内容、四条入口 —— ① **标语区**（纯展示，无交互）；② **两张功能卡**：**分析表达**（读懂语气与情绪 → **2026-10-06 起进主 App「AI 咨询师」页**，动作 home-analyze）/ **自由对话**（聊一聊，找灵感 → 同样进「AI 咨询师」页，动作 home-free-talk）；③ **「进入体验台」一行**（**2026-10-06 起同样进「AI 咨询师」页**，动作 home-keyboard —— 三处入口同一落点，见本目录 app-ai 条目）；④ **右上角信封图标**（2026-10-05 晚些需求：进「消息」整页，动作 home-msg —— 见本目录 messages 条目；**2026-10-06 需求：信箱有未读消息时，信封右上角浮一枚小红点** —— state.msgUnread 默认 true、点信封进消息页即置已读、返回首页红点熄灭，页面内存不落库；8px 圆点 #FF453A + 2px 与页底同色描边，中心压在信封图形右上角顶点上；骨架 .hm-dot 在 styles.css、尺寸与配色在 theme.css 首页一组）。三处出口 **2026-10-06 起都是「进主 App「AI 咨询师」页」**（同一条 openAppAi 出口；原先「离开主 App、回键盘形态」（returnKeyboard）的走向作废 —— 主 App 内不再有回键盘的入口）；⑤ **「限时特惠」悬浮卡**（2026-10-06 需求，页见 `offerBadge()` / `state.offerBadge`，**只在本页渲染**）：入口只一个 —— 「会员购买页 · 新」的**挽留弹窗被放弃**（弹窗右上角 x / Esc，`leaveOfferSheet()`），那一刻**优惠资格再保留 3 分钟**，本页浮出这颗可以拖动的卡兜住它；**功能**：① 卡上那串**毫秒倒计时**从「03:00:000」起跳（`MM:SS:mmm`，`startOfferBadge()` 的 47ms 定时器只改 `#ofb-time` 那一枚数字、不整页重渲染）；② **按住可拖**（`bindOfferBadge()`：pointer 事件，四边各留 8、下边让开 68 高的底部 Tab 栏，松手才把坐标记进 `state.offerBadgePos`、拖动中不重渲染），**拖过的那一下不算点击**（阈值 4px）；③ **点一下 = 直接调起支付**（`payFromOfferBadge()` = 动作 `offer-badge`）：记下优惠（`offerClaimed` 落库 → 永久档随即按 ¥128 显示）+ 落到「会员购买页 · 新」再按下「立即解锁」同一条分路（未勾协议先弹协议确认框，点「同意」即继续：iOS 弹 iOS 系统支付框 / 安卓·鸿蒙一键到账）；④ **归零 / 已是会员 = 整枚卡自动消失**（优惠资格作废，当天再进购买页仍能再领一次）；切到别的 Tab / 页不画这颗卡（定时器照走，切回来接着倒数），首启引导把设备摆回新机时一并收摊。**设计**：116×82、**圆角 14**、粉→洋红对角渐变（#FF5C8A → #FF3FA8 52% → #FE2CCF）+ 两层柔影（0 10px 24px #2A0A1B45、0 2px 6px #2A0A1B2E），默认**贴右下**（距右 14、距底 84 = 底部 Tab 68 + 16 的呼吸），拖动后改由内联 left / top 定位；顶部**深红标题条** #BD0262（高 24、圆角跟上卡）居中白字「限时特惠」12px 700、字距 1px；卡身两行居中：**倒计时 18px 800 白字等宽数字**（`font-variant-numeric: tabular-nums`）+ 下面 10px / 白字 85% 的「点击立即支付」；`touch-action:none`（拖动不被当成滚动）、按住变 grabbing、出现时 `.ofb-in` 上浮淡入（0.26s）。配色写死不跟随 .dark（首页是深色的，这颗卡要跳出来）。（2026-10-06 需求，见下一行与 `offerBadge()`）：**放弃「永久会员立减优惠」挽留弹窗**（弹窗右上角 x / Esc）那一刻起，**优惠资格再保留 3 分钟**，本页浮出这颗**可以拖动的卡**（点它 = 直接调起支付）。**设计**：整页深色 **按图定色、不跟随 .dark**（底色 #111318，与问题反馈页同一套做法），状态栏与底部 Tab 栏一起转深色（.guide-home 挂手机根，见 renderApp；底栏那三条深色规则在 theme.css 首页一组末尾）；正文左右内边距 20、**整块内容垂直居中**（2026-10-05 晚些需求：内容不满一屏时富余高度上下均分，不再全部挤在顶部），主标语 26px / 行高 39px 两行（#F2F3F5）、副标语 12px / 行高 19.8px 两行灰字（#A9AEB8），右侧插画 conversation_garden_v3（宽 48%、右缘贴正文右缘、与主标语顶对齐）；两张卡等宽两列（间距 11、高 153、圆角 16），卡面 **#1B2A45** 深蓝 / **#2C2925** 暖棕，卡内插画绝对定位钉在设计图量到的位置上（分析表达用新素材 analyze_tone_v1、自由对话复用 open_ideas_v3），卡名 17px 与说明 11.5px 沉在卡底，右上角那枚外链箭头两卡各一色（#7AA7FF / #D4B993）；「进入体验台」行 80 高（芯片 64×47 / 键位图 kbdTiles / 行名 14px / 折角 #6F7580）；右上角信封图标是描边图形（system-glyphs 的 envelope，#A9AEB8、图形 28px（2026-10-05 反馈「太小」从 22 放大一档；注意尺寸必须写在 theme.css 无分层规则里才生效，见 .hm-msg svg），钉在正文右上角）。',note:'设计图里「帮你回」模块与「好用，也要顺手」小节没做，内容因此比设计图短 —— 正文按设计图的自上而下节奏排（标语 → 间距 24 → 两张卡 → 间距 12 → 体验台行），2026-10-05 晚些需求起整块内容垂直居中、留白上下均分（此前按顶部对齐、底部留白是删掉那两块后的必然结果），勿以「下面太空」为由把内容补回来。「进入体验台」行在设计图里是「行名 + 已就绪…说明」两行一起居中，说明删掉后行名单独在行内垂直居中。**「限时特惠」悬浮卡只在本页渲染**（挂在手机根的浮层一串里、与内容同层，z-index 5 —— 压住底部 Tab 栏、让开 z-index 6 的各弹层），拖动只在首页范围内生效；倒计时与页面无关（按时间戳现算），切走再切回接着倒数。设计图底部 Tab 第二项写的是「关系」，原型仍是「对象」（Tab 名与「对象」页同源，未改）。'},
    {id:'messages',group:'首页与我的',name:'消息',route:'/messages',trigger:'首页右上角的信封图标（home-msg）；本列表点入（不落库）',desc:'**2026-10-05 按设计截图新增的独立整页**（首页右上角信封图标进来；无底部 Tab、整页浅色、状态栏连着转白 —— .guide-msg 挂手机根，同注销页 / 协议页那套做法）。**功能**：一条静态通知 ——「续费提醒：您的LoveCo会员将于5天后自动续期」（**2026-10-06 需求：原「您的L+会员…」**），右上角日期「09月25日」；卡内文案是**静态演示**（原型没有消息中心的数据结构，不接 state.memberExpiry 现算，勿据此当 bug 改成动态）。返回钮 / Esc 都回首页。**未读态（2026-10-06 需求）只有最小一版**：state.msgUnread —— 首页信封小红点读它，点信封进本页即置已读（红点熄灭）；本页自身不渲染任何未读标记（进来 / 停留 / 返回都不改本页内容）。**设计**：整页白底；**2026-10-06 需求：「消息」二字挪进页头顶栏（菜单栏）** —— 页头复用主 App 统一的 .app-page-head.user-head（返回箭头 + 居中「消息」标题同一行，同「用户 / 注销账号 / 问题反馈 / 关于 / 邀请有礼」页；标题 17px 加粗、返回钮 32px 圆底，颜色钉在页面墨色 #1C1C1E 上、不跟随 .dark），原「圆形返回钮独立一行 + 下方大号浅灰页名（21px、#9A9AA0、左对齐）」的排布作废；通知卡浅灰底 #F5F6F7、圆角 16、内边距 13/14 —— 左侧白色圆底（38px）内一枚灰时钟图标（icons 的 Clock，18px），中间标题「续费提醒」（14.5px 加粗 #1C1C1E）+ 说明「您的LoveCo会员将于5天后自动续期」（12px #8E8E93，单行），右上角日期「09月25日」（11.5px #B9B9BE）。**2026-10-05 反馈「文字图片、icon 太大了」整体收小一档**（原 26 / 34 / 48 / 24 / 16 / 13.5 / 13）',note:'消息页只有这一条静态提醒，没有消息列表数据；未读态 2026-10-06 需求起只有最小一版（state.msgUnread：首页信封红点读它、点信封进本页即置已读，本页不渲染未读标记）；后续若接真实消息中心，从这张卡开始扩'},
    {id:'app-ai',group:'首页与我的',name:'AI 咨询师',route:'/ai',trigger:'**首页三处入口都进这一页（2026-10-06 需求，三处同一落点）**：功能卡「分析表达」（home-analyze）/ 功能卡「自由对话」（home-free-talk）/「进入体验台」行（home-keyboard）；本列表点入（不落库）',desc:'**2026-10-06 按设计截图新增的整页**（**同日晚些需求：页面列表条目名由「问AI（AI 咨询师）」改名「AI 咨询师」**，与页内顶栏标题一致 —— 键盘形态的「问AI」页不受影响）：主 App 内与「AI 咨询师」的聊天页（无底部 Tab；整页固定浅色、状态栏连着转 #F4F1F8 浅紫灰 —— .guide-ai 挂手机根，同消息页那套做法；不跟随 .dark）。**功能**：① **顶部菜单栏** —— 左起汉堡「三」开/收**历史抽屉**、标题「AI 咨询师」、右端**新对话**（方框笔）与 **X**（关页面回首页；Esc 同一条出口 —— 抽屉开着时 Esc 只收抽屉，再按才退页面）。② **聊天记录（上半，自己滚）** —— 用户消息靠右：文字是灰底气泡、发出去的聊天截图是圆角卡（core/kit.js 的 shot() 现画，与键盘选图同一套画法）；AI 回复是靠左的浅灰大圆角卡，内容按 markdown 排版（「## 对话解读」→ 分析段 →「## 版本N（策略名）」三版建议 → 结尾「要不要我再写个更简短的版本？」）。发送后先出「正在输入」三点气泡、约 1.1s 后 AI 回复接在同一条记录里。**发送链路与键盘共用一条**：下半键盘的任何发送入口（键区蓝键 / 输入行右端蓝色发送按钮 / 快捷栏短语 / Enter / 按住说话松手）走同一条 sendFreeChat —— 主 App 形态分流到 appAiSend：带截图或快捷栏点了「帮我回」→ 聊天分析那条结构（对话解读 + 三版本，文案沿用 makeBrief / makeIdeas），纯文字提问 → AI通用回复（REVIEW_ANSWER / REVIEW_THINKING 的 markdown）；未登录发送被 needLogin 拦到「手机号登录」页；输入行左端头像（没设自定义头像时 = 2026-10-06 统一切换的那张默认头像插画）：**「AI 咨询师」页里从底部弹出对象列表**（2 行图片高度的窗口，选完即收，见 aiSheetHtml），其余主 App 形态仍进「对象」页（主 App 没有键盘覆盖层的管理页）。③ **历史抽屉（点汉堡）** —— 左侧白色面板（约 78% 宽）盖住整页（含键盘），被盖住的页面不压暗、右缘露出的部分是一层透明点击层（点了收抽屉）；面板自上而下：标题行「对话」+ 右端收起箭头、「⊕ 新对话」一行（开一条空会话并置为当前、收抽屉）、分隔线、会话列表（气泡图标 + 会话名「新对话」，**当前会话整行浅蓝底 #E5EEFC、图标转蓝 #3B82F6**；点行切换会话并收抽屉）。会话数据只在页面内存（state.aiThreads / aiThread）：首次进页摆一条**内置演示会话**（照设计截图那轮问答：AI 早前的一轮建议 → 用户发出聊天截图 → AI 的对话解读 + 三版本）+ 两条历史空会话；新对话 / 切换即时生效，刷新回到内置演示。④ **下半 = 贴底的输入栏（2026-10-06 晚些需求重做的三形态，见 aiKeyboardArea）**：默认只有**常驻输入栏** —— 同一块 kb-free-chat 但**不出「问AI」标题栏**，占位文案固定「输入或按住说话」；**2026-10-06 再晚些需求照豆包的输入栏把这一形态重做成悬浮卡片** —— 整行收进一张白色圆角卡片（头像 / 输入框 / 语音 / 图片都在卡内，输入区底色随之转白、缩略图行 / 快捷栏也不再画分隔线；**2026-10-06 需求：调出键盘后这张白卡照旧** —— 不再退回「键盘上的一行」（原来会变回灰底、输入框自带白底 8 圆角），卡片与下方键盘之间留 12px；开底部弹窗时卡片仍浮在弹窗上方、弹窗照旧贴底）；头像 / 输入框 / 语音 / 图片按钮全可用，Enter 也能发送，高度随内容（输入两行时卡片跟着长高）；**上方那行快捷栏常驻**，缩略图行只在附图时出现；**键盘不再常驻，点输入框才从底部调出「当前键盘」**（state.aaiKb）：当前输入法就是 LoveCo（permissions.ime=loveco 且键盘已启用）时是问AI 页那一套（标题栏「问AI」+ 圆形 X、缩略图行 / 快捷栏 / 提问输入行 + 键区 + 平台底栏 —— 键区打字 / 候选词栏 / 输入框三行长高 / 按住说话全部与键盘形态一致；标题栏的 X = 收键盘回输入栏，页面不退），否则是**系统键盘**（.kbsw-sys 的系统英文键盘，与「切换到 LoveCo 键盘」页同一套画法，高度 = 键区那一档）；点聊天记录区收键盘；**点图片**从底部弹出「2 行图片高度」的截图窗口（**贴底升起、把输入行顶到它上面** —— 与调出键盘同一形态，2026-10-06 晚些需求二改、原「输入栏上方弹出」作废；高度由 paintAaiSheet 实测 = 2 行卡片 + 行距 + 内边距，内部可滚；相册权限两档引导照旧，选图后输入行右端变蓝色发送按钮）；**点头像**从底部弹出同高的**对象列表**（**同样贴底升起、把输入行顶上去**；首行「不选择」，单选、选完即收，输入行左端头像随之更新）；Esc 按层退：历史抽屉 → 弹窗 / 调出的键盘 → 页面。**设计**：整页白底；顶部菜单栏 52px、底 #F4F1F8（按设计图取样）、栏底一条 #ECEAF1 分隔线 —— 汉堡 / 标题墨色 #29232F（标题 17px 加粗）、新对话图标蓝 #3B82F6、X 灰 #67646F；AI 卡底 #F7F7F7、圆角 14、内边距 12/16、正文 15px/1.75 #1C1C1E、小节标题（h4）16px 加粗；用户文字气泡 #ECECF1；三点气泡同 AI 卡底、圆点 #B5B5BE 起伏；抽屉白底 + 右缘投影、⊕ 新对话黑圆白加号、列表行高约 40px；**常驻输入卡**（2026-10-06 再晚些需求）：白底、圆角 16、一行时高 50、内边距 8/12/8/8、阴影 0 2px 8px #1D1D261A + 0 12px 28px #1D1D261F、距屏幕底 18（**2026-10-06 需求：调出键盘时卡片照旧，卡片与键盘顶之间留 12**；**2026-10-06 同日晚些需求：圆角由 24 收到 16** —— 24 在 50 高的卡上是半个卡高的胶囊、被点名「有点丑」，按参考图（豆包输入栏 153px 高 / 圆角 45px，折 2.748 约 16）改成圆角长方形，卡高与留白都不动），卡内 textarea 透明底 / 无边框（文字直接写在卡上）。骨架 .aai-* 在 styles.css、皮肤在 theme.css「问AI页」一组',note:'发送不接积分 / 额度检查（键盘那条 generate() 的额度链路不在这一支上）；会话与抽屉都是页面内存、不落库；页面里没有「回键盘形态」的入口 —— 回键盘走工作台左栏的 App形态切换'},
    {id:'account',group:'首页与我的',name:'我的',route:'/account',trigger:'主 App 底部 Tab 第三项「我的」',desc:'按设计图重做的「我的」页，自上而下：① 问候行（**未登录时改显示「立即登录」占位**（2026-10-04 需求），点它由 needLogin 拦到登录页；已登录显示**「你好 + 手机号掩码」**（「你好 138****8000」，取 state.phone，2026-10-04 晚些需求：原先是「你好，昵称」，逗号也不要了；**2026-10-06 需求：上内边距 2 → 14px 离状态栏远一档，且本页问候行与各组行不再有悬停蓝色高亮（.app-hello.as-button:hover / .app-row:hover 已删）；同日晚些需求：问候行与下方会员横幅的间距太大 —— 问候行再往下压（上内边距 14 → 18px、底内边距 9 → 7px），横幅 margin-top 14 → 8px，两块空隙 23 → 15px**）+ 折角箭头，点它进用户页。**2026-10-05 需求：已开通会员时问候行下方那行金色会员标识（小方块「LoveCo」+「会员到期日 2026-09-30」，永久档写「永久会员」）整行删除** —— 到期日信息改由会员横幅内的一行承担）；② 会员横幅（未开通蓝底「成为 LoveCo 会员 / 解锁无限次AI使用」，已开通橙底「LoveCo 会员 / 已解锁无限次AI使用 / 2026-09-30到期（右对齐）」，右侧白胶囊「升级会员」进**第二个会员购买页「L+ 会员」**（**2026-10-05 需求：胶囊文案原「立即查看」，同日再按需求改「升级会员」（已开通态；未开通蓝底态仍是「立即解锁」）；已开通态在「已解锁无限次AI使用」下方补一行到期日「2026年9月30日到期」→ **2026-10-05 晚些需求改「2026-09-30到期」**（年月日补零、短横分隔、**右对齐**、与右侧胶囊留 8px；永久 / 老存档不显示）；**永久会员形态**（memberExpiry === 0）标题写「LoveCo 永久会员」、不收升级按钮、不显示到期日行 —— 见 `memberBanner` / `memberExpiryText`，左栏「模拟 › 永久会员」开关可一键摆出这一态；会员卡片落这一页**（未开通蓝底 / 已开通橙底都进，`app-membership-plus` 动作）；**2026-10-06 起「会员中心」行也落这一页、两处同一落点**（第一个购买页 purchase 同日已按需求整页删除，勿再补回）；2026-09-28 起主 App 的购买走整页购买页、不再弹键盘同款的会员开通覆盖层）—— **2026-10-03 需求：会员文案的品牌口径从「L+」改成「LoveCo」**（横幅两态 + 会员标识小方块，界面里不再出现 L+，见 `memberBanner` / `appAccountPage`）—— **2026-10-05 需求：会员权益口径从「解锁全部高级功能」改成「解锁无限次AI使用」**（横幅两态副标题 + 会员标识行那两处「已解锁…」，主 App 界面里不再出现「全部高级功能」，见 `memberBanner` / `memberBadgeText`））；③「**账户**」卡片两行（2026-10-04 需求：这一组按需求加回、排在「支持」之上 —— 「会员中心」→ **第一个会员购买页**（2026-10-05 需求：原「会员与积分」行改名「会员中心」）（`app-membership` 动作；**2026-10-05 起与会员卡片分头** —— 卡片改走「会员购买页 · 新」purchase2-copy（原「L+ 会员」页 purchase2 2026-10-06 已按需求整页删除），这一行仍是第一个购买页；原「会员与积分」整页 2026-09-26 已删，这里不重建那页）；「邀请有礼」→ **「邀请有礼」整页**（2026-10-05 起 —— 邀请码功能页已按需求做出，原「即将上线」轻提示撤掉；`invite` 动作 → `openAppScreen`（appScreen 取 invite），未登录先由 needLogin 拦到登录页，见本目录 `invite` 条目））；④「支持」卡片两行（**2026-10-04 晚些需求：栏目名由「客户支持」改「支持」**，两行也随之换过一轮）：「反馈与建议」→ 问题反馈页（类型默认「功能问题」）；**「联系客服」排在它下面**（2026-10-04 再改）→ 就地弹**「联系客服」弹层**（`sheet` 通用底部卡片，**卡内只剩一行「客服邮箱」** `support@loveco.gasairea.com`，**点整行即复制、复制完立刻收起弹层**（2026-10-04 晚些需求：不再有「图标变勾 1.2 秒后复原」那一下 —— 弹层收起了看不到，所以复制图标常驻）；**不显示客服微信、也不显示服务时间** —— 这两行 2026-10-04 再改按需求删掉；这一行不读登录态，未登录也弹得开）。**原首行「键盘内容投诉与举报」已按本轮需求整行删除**（它原先进问题反馈页并把类型预选成「投诉与举报」；问题类型里那颗胶囊仍在，只是不再有入口预选它）；⑤「隐私与协议」卡片（**2026-10-04 再改：栏目名由「相关协议」改「隐私与协议」**；用户协议 / 隐私政策 / 个人信息收集清单 / 第三方信息共享清单，各自打开对应协议正文整页；卡片原末行「协议中心」2026-10-04 晚些按需求删除）；⑥「更多」卡片一行（关于 LoveCo，副说明写版本号 `Version 1.9.0`）—— **2026-10-04 需求：设计图里「关于 Lovekey 键盘 / 这是一款可以帮你聊天的键盘输入法」与「Version 1.9.0 / 上线一些新人设」两行并成这一行**（品牌改 LoveCo、版本号挪进本行副说明、原独立版本条目不再出现；**2026-10-04 晚些这一行接上了落地页** —— 点它进**「关于 LoveCo」整页**（appScreen 取 about，见本目录里的 `about` 条目；此前当轮它还是纯展示行 —— `appRowSub` 不给 action 即静态行）；**2026-10-06 需求：行下副说明版本号「Version 1.9.0」删掉，这行退回普通单行 `appRow`**）。**2026-10-04 需求：原「账户」卡片一行（退出登录）整组删除** —— 同日再按需求把这一组加回来（见上面 ③），现在的两行是「会员与积分」「邀请有礼」，**不再有「退出登录」那一行**（退出登录仍从「用户」页页尾那颗卡进）。设计图里右上角的邮箱图标（消息通知）、「基础设置 · 键盘基础预设」与「消息提醒 · 消息通知」两组按需求不呈现（键盘设置页面与入口已于 2026-09-26 整体删除）。2026-09-26 另删三行入口：「在线客服」「我的订单」「兑换积分」（对应页面一并删除）；同日晚些时候卡片下方那枚「注销仿真账户」文字按钮也删除（连同确认框链路，页面至此没有任何注销类入口）。**2026-10-03 修复：本列表点入现场摆成未开通态** —— 点「我的」时先把会员态复位（`member=false` / `memberExpiry=null`，不落库），否则从「我的 · 已开通会员」切回来时页面仍是会员态、看着像没切过去（见 `setupPage()`）。**2026-10-06 需求：卡片内 item 之间的分隔线 1px → 半像素**（用户原话「我的、我的 · 已开通会员页面 item 的分隔线 再细一点」；视网膜屏 DPR 2 下 = 1 物理像素、正好是原来的一半；实现不能用 `border-top: 0.5px` —— Chrome 会把不足 1px 的边框宽度取整回 1px、白改，改成行顶挂一条 1px 伪元素再 `transform: scaleY(0.5)` 压半，见 theme.css 的 `.app-card > .app-row:not(:first-child)`；同套 `.app-row` 列表一起生效：「我的」/「我的 · 已开通会员」两个形态 +「用户」页）',note:'「我的」不再有键盘设置入口（该页面已删除）；注销入口已删，页面内不再有「需先清空会员 / 积分才能操作」的前置条件；**这一页未登录也进得来**（2026-10-04 需求：未登录点「我的」Tab 不再被登录页挡下 —— 先正常进页、0.5 秒后按蜂窝网络开关补弹「一键登录」/「手机号登录」独立页面，页内问候行显示「立即登录」；见 action 的 app-tab 分支与 ACCOUNT_LOGIN_DELAY_MS）'},
    {id:'account-member',group:'首页与我的',name:'我的 · 已开通会员',route:'/account（会员态）',trigger:'本列表点入（现场摆上会员态与到期日 2026-09-30，不落库）；真实链路里购买会员到账后也是这一形态',desc:'「我的」页的会员态：会员横幅换成橙底「LoveCo 会员 / 已解锁无限次AI使用 / 2026-09-30到期（右对齐）」，右侧白胶囊「升级会员」；**2026-10-05 需求：问候行下方那行金色会员标识（小方块「LoveCo」+「会员到期日 2026-09-30」，永久档写「永久会员 · 已解锁无限次AI使用」）整行删除** —— 主 App 的会员到期日现在只在横幅里；**永久会员形态**（memberExpiry === 0，左栏「模拟 › 永久会员」开关可一键摆出）标题写「LoveCo 永久会员」、不收升级按钮、不显示到期日行。其余分区（账户 / 支持 / 隐私与协议 / 更多）与未开通时完全一致 —— **「账户」组 2026-10-04 曾整组删除、同日再按需求加回**（两行 = 会员中心 → **「会员购买页 · 新」purchase2-copy** / 邀请有礼 → **「邀请有礼」整页**，2026-10-05 起；会员中心这一行 2026-10-06 起与会员卡片同一落点）。**2026-10-03 需求：条目名由「我的 · 已开通 L+ 会员」改名「我的 · 已开通会员」、页面内容里的「L+」一并改成「LoveCo」**',note:'会员到期日与会员标识一起持久化：购买后写入（会员购买页与键盘内共用同一条到账链路 completePurchase —— **2026-10-06 起主 App 只剩「会员购买页 · 新」一张购买页**，它按 PLUS_PLANS 算（永久 0、季度 90 天、周 7 天 —— 晚些需求起原月度 30 天改周 7 天，见 checkoutPlan），键盘付费层按 PLANS 算（永久档落 0 = 永久、周 / 季度档按 7 / 90 天）；到账后看到的都是同一份会员态）；老存档只有会员标识、没有到期信息时不硬编日期，只说「已解锁无限次AI使用」（**2026-10-05 需求：原「已解锁全部高级功能」**；「我的」页那行会员标识同日删除后，这条文案现在只在「邀请有礼」页的领取完成卡里出现）；点入这条会把会员态**现场摆上**（不落库），点回「我的」条目即复位成未开通态（2026-10-03 用户反馈修复，两条互为对方形态的入口）'},
    {id:'purchase2-copy',group:'会员中心',name:'会员购买页 · 新',route:'/account/purchase2-copy',trigger:'**2026-10-06 起主 App 的购买都落这一页**：「我的」页的会员卡片（会员横幅右侧白胶囊，未开通蓝底「立即解锁」/ 已开通橙底「升级会员」都进，app-membership-plus 动作）＋「账户」组的「会员中心」行（app-membership 动作）＋ 主 App 内额度不足发起生成被拦 ＋ 键盘安卓 / 鸿蒙点「立即解锁」跳转（gotoAppPurchase）—— 四处入口同一落点；前两处未登录先由 needLogin 拦到登录页。**同日第一个购买页 purchase「会员购买页」与第二个购买页 purchase2「L+ 会员」都已按需求整页删除**（勿再补回），原先进那两页的入口全部改落本页；也能**从本列表点入**（setupPage 走 openAppScreen("purchase2-copy")，进页把支付渠道摆回首选支付宝、档位摆回永久会员、协议勾选框摆回未勾选、协议确认框收起）；**2026-10-06 更晚些需求起 Esc / 左上角叉号是「命中弹窗条件先弹「永久会员立减优惠」挽留弹窗、没弹才回「我的」」**（同日再改一次条件，2026-10-06 再晚些又再改一次：**首启引导那一轮无条件必弹** —— 不看当天弹没弹过、也不掷那记随机；同时「模拟 › 首启引导」开关要陪着本页这一轮走完才结束：落到首页那一刻不关（那边改成先排本页、再谈收尾，见 launchPaywall 挂起的 state.firstLaunchTail）、本页 x 弹挽留之后仍不关，**从挽留层再退出、回到首页**才由 finishFirstLaunch 自动关闭；其余情况仍是随机 1/4 命中才弹、当天已弹过一律不弹**，见 desc ⑦）；**2026-10-06 再晚些需求（本轮）又添第五条入口 —— 打开 App 的落点**：每次打开 App（本机加载后的启动流程 / 工作台切到主 App 形态 / 引导与登录走完回到 App）**落到首页那一刻，未开通会员就等 1 秒、再从底部自动滑出本页**（launchPaywall：`LAUNCH_PAYWALL_DELAY_MS` 定时器 + 根节点挂 `.entering` 整页滑入；已是会员或本次启动已弹过就不弹；**这一秒里用户已离开首页就放弃弹出**），引导页 / 登录页 / 资料引导 / 「键盘使用引导（演示）」上不弹（**2026-10-08 需求把演示挪到链路最后：引导链路里这次弹出改在演示收场那一下才排**）；**自动弹出的这一次，没弹挽留弹窗时点左上角叉号 / Esc 直接回首页**（state.pu2Launch；弹窗那条判定对它一视同仁 —— 首启引导里的这一次必弹，放弃后同样回首页，见 desc ⑦）—— 见 desc 与 note 末段',desc:'**第二个会员购买页 purchase2（原页名「会员购买页 · 新」）的拷贝**（2026-10-06 新增，appScreen="purchase2-copy"；**同日晚些需求本页由「会员购买页 · 新2」改回「会员购买页 · 新」这个名字**）—— **原页 2026-10-06 已按需求整页删除**（勿再补回），本页是这一版设计的留存，DOM / 商品 / 动作 / 样式与原页逐项一致（**2026-10-06 需求起档位卡视觉分头**，见「设计」），只有路由与入口不同。**2026-10-06 起本页还是主 App 唯一的会员购买页** —— 第一个购买页 purchase（appPurchasePage）同日也已按需求整页删除（入口全部改落本页，勿再补回那页）：商品取 PLUS_PLANS + state.pu2Plan（原页共用同一张表与同一个选中态，现在由本页独享）、支付渠道走 purchase-pay（进页回首选支付宝）、主按钮走 p2-buy 同一条分路（iOS 就地弹 iOS 系统支付框、安卓 / 鸿蒙一键到账 completePurchase，到账后「我的」横幅转橙底）、协议名点开协议正文整页（返回箭头 / Esc 回本页且所选档位与渠道都留着）。**功能**：① 三档商品卡点选切档位（永久 / 季度 / 周 —— **2026-10-06 晚些需求：原月度档改周档（共用表，随原页一起改）**，**默认选中永久会员**（同日晚些需求：原默认季度）；**2026-10-06 更晚些需求（本轮）三档改价：永久 ¥168 / 划价 ¥840、季度 ¥88 / 划价 ¥148、周 ¥9.9 / 划价 ¥28** —— 只改共用表 PLUS_PLANS，领过立减优惠时永久档现价按 ¥128 显示，见 ⑦）；② 安卓 / 鸿蒙那一行点任意处切支付宝 ↔ 微信支付（**2026-10-06 需求：iOS 上这一行仍在原位、只是置成不可见占位** —— 见「设计」末段）；③ 左上角圆形叉号（p2-close）与 Esc 同为出口 —— **2026-10-06 更晚些需求（本轮）起「命中弹窗条件」点它不退出页面、改弹「永久会员立减优惠」挽留弹窗**（leavePurchasePage：**首启引导必弹、其余情况随机 1/4 命中才弹、当天已弹过一律不弹**，见 ⑦；没弹时才真退出：**首页等 1 秒自动弹出的那一次回首页**，state.pu2Launch，其余回「我的」）；④ 紫渐变主按钮只有居中的「立即解锁」+ 右上角一枚红角标（文案随档位变 = 该档 badge：永久「一次性买断」/ 季度「畅享 90 天」/ 周「畅享 7 天」；**2026-10-06 晚些需求与「会员购买页 · 新」同步改版** —— 原「划线原价 + 大号现价 + 立即解锁」里前两段删掉、本页不再显示价格与划线价，两页按钮同一支；**整颗一跳一跳** —— 1.4s 来回、scale 1 ↔ 1.055 + 紫投影同步加深，试付进行中停下）；⑤ 协议行带圆形勾选框 + **协议确认框**（pu2AskSheet，state.pu2Ask —— **2026-10-06 晚些需求**：未勾选协议时点「立即解锁」先弹协议确认框，点「同意」= 勾上协议 + 立即调起支付（iOS 表现为弹 iOS 系统支付框）；**切换档位卡也直接弹协议确认框**，确认后立即按新档支付；已勾选时主按钮直接支付；「取消」/ Esc 只收框。**2026-10-06 再晚些需求照新样式简化**：标题「同意协议后继续」与说明段删掉，卡内只剩一句左对齐的「我已阅读并同意《自动续费协议》《会员协议》」（协议名仍可点开协议正文整页；《自动续费协议》与协议行同一条件渲染），按钮改「取消 / 同意」两颗圆角矩形（右按钮纯色蓝底），行为不变）；⑥「兑换码」白胶囊（**2026-10-06 需求：iOS 上同样只保留占位、置成不可见**）点它**从手机底部滑出半屏的「兑换码」弹层**（**2026-10-06 需求**，state.redeemSheet / redeemSheet()，原「给一记轻提示」作废）：弹层高半屏、贴底、顶部大圆角（骨架 .rd-* 在 styles.css、皮肤在 theme.css）—— 抓手 + 居中标题「兑换码」+ 右上角圆形 X → 大号居中输入框（自动转大写、只留字母数字、最长 12 位）→ 校验提示行（无效 / 已用过 / 格式 / 抱歉兑换失败 / 已是永久会员，有错才出现）→ 沉底的紫渐变「立即兑换」（空输入置灰不可点）；**2026-10-06 再晚些需求**：说明句（「输入兑换码，会员时长立即到账」）与底部规则小字都删掉（输入框改居中布局）、无效文案简化为「兑换码无效或已过期」、有效码点「立即兑换」随机成功 / 失败（失败 → 一行「抱歉，兑换失败」，不到账、不消耗码，可重试）；校验通过按码的天数当场到账（grantRedeemDays，与邀请奖励同口径：非会员从此刻起算、有效期上顺延、永久会员不叠加），卡内切**成功态**（绿勾 + 「兑换成功」+「会员时长 +N 天」+ 到期日一行 + 沉底「完成」）。演示码 **LOVECO7 / LOVECO30 / LOVECO365** → 7 / 30 / 365 天，其余任意码按「兑换码无效或已过期」（真机由服务端判定）；已用过的码落库（state.redeemUsed），重复输入即「该兑换码已被使用」；X / Esc / 「完成」都只收弹层、仍停在购买页（换页由 openAppScreen 收起）；⑦ **「永久会员立减优惠」挽留弹窗**（**2026-10-06 更晚些需求（本轮）**，pu2OfferSheet / state.pu2Offer，骨架 + 皮肤在 theme.css 的 .pu2-offer-* 一组、挂点与 .pu2-ask 同处）：点购买页出口（叉号 / Esc）**命中弹窗条件时改弹这一层挽留**（**2026-10-06 同日再改一次条件：首启引导必弹、其余情况随机 1/4 命中才弹、当天已弹过一律不弹** —— 跨天自然恢复） —— 【功能】照用户参考图重绘、并**自加一行 3 分钟倒计时**：① 标题「确定放弃永久会员立减优惠？」；② 倒计时「优惠剩余 03:00」起跳、每秒走一格（openOfferSheet 的 setInterval 只改写 #pu2-offer-count 一枚数字、不整页重渲染），**归零自动收层**（放弃优惠、仍停在购买页，当天不再弹）；③ 权益四条（无限次使用 AI 生成 / 解锁全部聊天对象 / 键盘不限次使用 / 解锁全部关系阶段，常量 OFFER_BENEFITS）；④ 左红块「永久会员 / 立减优惠」+ 右米块「立减 ¥40」（168 − 128）；⑤ **「领取优惠」（offer-claim）= 记下优惠（offerClaimed 落库 → 永久档随即按 OFFER_PRICE 的 ¥128 显示，见 offerPrice()；划线原价仍取 840）+ 直接进入支付** —— 关层后走与 p2-buy 同一条分路（未勾协议先弹协议确认框、点「同意」即勾上并继续；iOS 弹 iOS 系统支付框 / 安卓·鸿蒙一键到账）；⑥ 弹窗右上角圆形 x（offer-close）= 放弃优惠 + 一并退出购买页（自动弹出的那一次回首页、其余回「我的」，见 leaveOfferSheet）。**「当天一次」按本机自然日算**：弹窗打开时把 state.offerDate（YYYY-MM-DD）落库，offerShownToday() 是这条出口的第一道判定（当天已弹过就直接退出、不再弹）；offerClaimed 与 offerDate 同一天才让优惠价生效（跨天自动回 ¥168、当天点叉号又能再领一次）。【设计】照参考图配色写死、不跟随 .dark：卡片浅紫垂直渐变（#CAD5FD 顶部 → 近白底）+ 22px 大圆角、宽 82%（393 屏 ≈323px）、居中于正文区；右上角 28px 圆形 x（半透明白底 + 灰紫叉）；标题 20px / 800 / 蓝 #577CFF 居中（上内边距 38px）；倒计时行 13px 红 #FF4E60 + 14px 时钟图标、数字等宽；权益四条 14px 蓝字 #4F72FF + 15px 蓝圆白勾、行距 10px；双色块高 96、圆角 14（左红对角渐变 #FF4D60 → #FF9AA5 + 两行 16px 白字；右米→粉对角渐变 + 27px 深灰「立减 ¥40」+ 右端一条条形码装饰纹）；「领取优惠」紫粉渐变胶囊（#4C60F8 → #FA6076、46px 高、宽 86%）+ 紫粉投影；蒙层同协议确认框那颗 #10101A6B、层级 z-index 6（同 .pu2-ask）。**设计**：与「会员购买页 · 新」同一套骨架与皮肤（.pu2-* 一组，见 theme.css）—— 固定浅紫底整页、不跟随深色外观、铺满整个屏幕（状态栏跟着转浅紫 .guide-purchase2、底部 Tab 栏不渲染）；纵向：左上角叉号 + 居中标题「成为**LoveCo会员**，解锁无限次AI使用」→ 三张纵向档位卡（永久 / 季度 / 周，白底、选中那张紫描边 + 白→浅紫渐变底、卡顶浮蓝角标 = 用户选择占比（**右对齐**贴卡右上角 —— 2026-10-06 晚些需求，原居中）；**2026-10-06 需求起视觉分头**：卡右端「立减 ¥xx」浅紫胶囊整枚去掉，现价移到卡片**右端**、其下挂一行划线原价（**划线原价与上方现价居中对齐** —— 同日晚些需求），原价格后面的灰标语**左移**、退到档位名下面一行；档位名右侧促销胶囊**只有永久档挂**黄色「低至0.01元/日」（**2026-10-06 再晚些需求**：原「三档都挂」口径收回，季度银 / 周红铜两枚「低至xx元/每日」按需求去掉）—— 卡挂 .pu2-plan-v2 修饰类，各修饰类只服务本页、见 theme.css）→ 随档位变的续订说明（金额取现价）→ 支付方式行 → 底部组（兑换码 + 主按钮 + 协议行，富余高度由卡组自己吸收）。**2026-10-06 需求（iOS 对齐安卓 / 鸿蒙）**：支付方式行与兑换码胶囊**三端渲染同一份 DOM**、iOS 上由 CSS 置成**不可见占位**（高度留在原位，theme.css 的 .phone[data-platform="ios"] .pu2-page 两条）—— 档位卡 / 续订说明 / 主按钮 / 协议行的尺寸与纵向节奏三端逐像素一致，iOS 少的只是这两块本身（看不到、点不到、读屏读不到）；此前 iOS 直接不渲染这两块，省下的约 84px 高度被卡组吸收，卡片被撑高、三张卡在卡组内居中被推离标题。**2026-10-06 晚些需求（整页一屏放下）**：① 标题上边距 40 → **50px** —— 用户反馈「X 号和标题挨着太近」，左上角叉号（占 10–38px）与标题首行文字的视觉间距从 ~6px 拉开到 ~15px；② 其余纵向尺寸整体收一档、保证**所有内容一屏放下**（工作台 335 宽手机内容总高一度 672px、协议行被裁到折叠线下要滚动才能看全）：卡组上边距 24 → 18px、卡内边距 15/14 → 12/12、现价 26 → 24px（¥ 16 → 15px）、卡内标语上间距 6 → 4px、续订说明上边距 22 → 12px、支付行上边距 24 → 16px、底部组上下留白 16/24 → 12/16px、主按钮上边距 16 → 12px、协议行上边距 10 → 8px —— 内容总高收至 ≈597px，650–874px 全区间手机高度都一屏放下、无滚动；富余高度照旧由卡组吸收（卡片长高到 102px 上限、多余在卡组内上下均分），各数字明细见 theme.css 组头注释。**2026-10-06 再晚些需求（打开 App 自动弹出，本轮）**：本页多了一条**启动入口** —— 每次打开 App（本机加载后的启动流程 / 工作台切到主 App 形态 / 引导与登录走完回到 App）**落到首页那一刻**，未开通会员（!state.member）就**等 1 秒、再从底部整页滑出本页**（launchPaywall：状态检查链三环都过、真要落首页时才排这次弹出；`LAUNCH_PAYWALL_DELAY_MS` = 1000ms，滑入走根节点 `.entering` 的 `pu2-page-up`（0.3s，`translateY(100%)` → 0）；已是会员、或本次启动已经弹过就不弹 —— state.launchPaywallShown 只存内存、刷新复位，关掉本页后再回首页也不重复弹；**这一秒里用户已离开首页就放弃弹出**）；弹的是本页的默认态（档位永久会员 / 渠道支付宝 / 协议未勾选 / 无弹层），**自动弹出的这一次没弹挽留弹窗时点左上角叉号 / Esc 直接回首页**（state.pu2Launch；挽留弹窗那条判定对它一视同仁 —— 首启引导里的这一次必弹，弹窗放弃后同样回首页，见 desc ⑦）。',note:'2026-10-06 需求：用户要求「copy 一份 会员购买页 · 新 页面，放在页面列表中，名称叫做 会员购买页 · 新2」—— 本条目就是那张拷贝页（appPurchasePlusCopyPage / appScreen="purchase2-copy"），**暂态**：入口以后再按需求接；两页从这里开始各自演进（改动本页不影响「会员购买页 · 新」—— 即使眼下逐行相同，也别把两条当重复合并 / 删掉，同「会员购买2」purchase-copy 那条拷贝页的口径）。结算档位走 checkoutPlan()：appScreen 为 purchase2 或 purchase2-copy 时都走 PLUS_PLANS + state.pu2Plan。**2026-10-06 后续需求**：档位卡布局调整 —— ① 右端「立减 ¥xx」去掉；② 现价移到卡片右端、下面显示划线原价；③ 价格移走后原价格后面的灰标语左移到档位名下面 —— 三条只落本页（appPurchasePlusCopyPage 的卡挂 .pu2-plan-v2 + theme.css 新增修饰类），「会员购买页 · 新」不动。**2026-10-06 晚些需求**：①「会员购买页 · 新」主按钮改版（去价格与划线价、只剩居中「立即解锁」+ 右上角红角标随档位变）—— **同日按需求同步到本页**（用户原话「把这些更改同步变更到 会员购买页 · 新2」），.pu2-cta-origin / .pu2-cta-price 两个 span 两页都不再渲染、theme.css 里那两条随之删除；② 档位表 PLUS_PLANS 是共用的 —— 月度档改「周会员」（¥9.9 / 划价 ¥48 /「一杯奶茶的钱」）两页一起生效；周档到期日按 7 天算（原 30 天）。**原页 2026-10-06 已按需求整页删除**，这套 DOM 与皮肤由本页独享（本页挂 .pu2-plan-v2）。**2026-10-06 再晚些需求**：① 页面名称由「会员购买页 · 新2」改回「会员购买页 · 新」（原页已删、名字由本页继承）；② 档位卡再调 —— 蓝角标「x%的用户选择」改右对齐、划线原价与现价居中对齐、季度 / 周补「低至xx元/每日」促销胶囊（银 / 红铜底，永久档那枚黄胶囊不变）；③ 默认选中档位改永久会员；④ 新增协议确认框（pu2AskSheet / state.pu2Ask）—— 未勾选协议点「立即解锁」弹框、切换档位卡直接弹框，点「同意并继续」勾上协议并立即调起支付（iOS 弹 iOS 系统支付框 / 安卓·鸿蒙一键到账），「取消」/ Esc 只收框；换页一律收起确认框。**2026-10-06 再晚些需求**：① 季度 / 周档的「低至xx元/每日」促销胶囊去掉（promo / promoTone 删除，只剩永久档那枚黄色；theme.css 的 .silver / .copper 修饰类随之删掉）；② 协议确认框照新样式简化 —— 标题与说明段删掉，只剩一句「我已阅读并同意《自动续费协议》《会员协议》」+「取消 / 同意」两颗圆角按钮（原「同意并继续」改「同意」、右按钮改纯色蓝底），行为不变。**2026-10-06 再晚些需求（兑换码）**：本页「兑换码」白胶囊（当时仅安卓 / 鸿蒙渲染；**同日晚些改为三端同渲染、iOS 置占位**）不再给「即将开放」轻提示，改为**从底部滑出半屏兑换弹层** —— 输入兑换码（演示码 LOVECO7 / LOVECO30 / LOVECO365 → 7 / 30 / 365 天）校验通过当场到账、卡内切成功态（绿勾 + 「会员时长 +N 天」+ 到期日），无效 / 已用过 / 已是永久会员各给一行提示；已用过的码存 state.redeemUsed（落库）防重复兑换，X / Esc / 「完成」都只收弹层、仍停在购买页。**2026-10-06 再晚些需求（兑换码三处调整）**：① 输入态里的说明句（「输入兑换码，会员时长立即到账」）与底部规则小字（「每个兑换码仅限使用一次…」）都删掉 —— 骨架 .rd-sub / .rd-note 与皮肤一并删除、输入框改 margin-top:auto 在标题与沉底按钮之间居中；② 无效文案简化成「兑换码无效或已过期」（原带「，请检查后重试」）；③ 有效码点「立即兑换」**随机**成功 / 失败（失败只给一行「抱歉，兑换失败」，不到账、不消耗码、可重试）。**2026-10-06 晚些需求（整页一屏放下）**：用户反馈 ① 左上角 X 与标题挨得太近、② 底部协议行超出页面、要滚动才能全部看到 —— 标题上边距 40 → 50px 拉开与 X 的间距，其余纵向尺寸整体收一档（明细见本条 desc「设计」段与 theme.css 组头注释），实测（playwright 新会话 lcfit2，本地 4173 页面列表点入，工作台 335 宽 / 690 高手机）：main scrollHeight == clientHeight（648 == 648，无滚动），协议行完整落在屏内；截屏核对 X-标题间距与底部组观感正常。**2026-10-06 再晚些需求（iOS 布局与安卓 / 鸿蒙对齐）**：用户反馈「目前 iOS的会员购买页面布局与安卓不同步，虽然 ios 的 会员购买页会少 支付渠道和兑换码，但其他地方的元素大小、布局应当保持一致」—— 支付方式行与兑换码胶囊改**三端渲染同一份 DOM**（去掉 state.platform=="ios" 的三元分叉），iOS 上由 [theme.css](file:///Users/wqlm/Documents/work/project/LoveCo/UI/theme.css) 置成**不可见占位**（`.phone[data-platform="ios"] .pu2-page .pu2-pay, … .pu2-redeem { visibility: hidden }`，保留高度）：档位卡 / 续订说明 / 主按钮 / 协议行的尺寸与纵向节奏与安卓 / 鸿蒙逐像素一致，iOS 少的只是这两块本身；此前 iOS 直接不渲染、省下的约 84px 被卡组吸收（卡片被撑高、三张卡在卡组内居中被推离标题）。实测（playwright 新会话 `pu2v1` ~ `pu2v4`，本地 4173）：device 视图 393×852 与工作台 335 宽手机（1280×852 视口）下，两平台的卡组 / 三张卡 / 续订说明 / 底部组 / 协议行几何逐项相等（device 视图卡组 y=124.3 h=501.2、三张卡 y=[203.9, 323.9, 443.9] h=[102, 102, 102]），iOS 的 `.pu2-pay` / `.pu2-redeem` 占位仍在、computed `visibility: hidden`（安卓 `visible`）。**2026-10-06 更晚些需求（本轮）**：① **三档改价**（永久 ¥168 / 划价 ¥840、季度 ¥88 / 划价 ¥148、周档划线 ¥28，只改共用表 PLUS_PLANS；键盘付费层 PLANS 不动）；② **新增「永久会员立减优惠」挽留弹窗**（pu2OfferSheet / state.pu2Offer —— 每天一次 + 3 分钟倒计时 + 「领取优惠」记下优惠后永久档按 ¥128 显示并**直接进入支付**；见 desc ⑦）；③ **购买页出口改走 leavePurchasePage()**：叉号 / Esc **首启引导必弹挽留弹窗（state.firstLaunch，左栏「模拟 › 首启引导」那条链路，含首页自动弹出的付费墙）、其余情况随机 1/4 命中才弹（OFFER_POP_RATE）、当天已弹过一律不弹**（跨天自然恢复），没弹时自动弹出的那次回首页、其余回「我的」；④ 两个落库字段 offerDate（上次弹窗日期）/ offerClaimed（是否已领取）随 persist() 写入，优惠价只在「领取当天」生效、跨天自动回 ¥168。**2026-10-06 再晚些需求（本轮）· 打开 App 自动弹出**：用户要求「每次打开 app 时，进入首页时，如果用户没有购买会员，弹出 会员购买页」—— 本页成了**打开 App 的落地弹层**：新增 launchPaywall()（state.launchPaywallShown 记本次启动是否弹过，内存不落库），在**四处「落到首页」的链路**末尾接上 —— appEntryCheck（启动 / 工作台切到主 App 形态）、finishGuide（键盘权限引导走完）、登录收尾回首页（finishKbLogin 里 appLoginReturn 为空即回首页那支）、finishOnboarding（资料引导走完）；判定统一是「未开通会员（!state.member）且本次启动没弹过」—— 已是会员不弹、弹过一次后关掉再回首页也不弹，弹的时机一律在状态检查链之后（引导页 / 登录页 / 资料引导 / 「键盘使用引导（演示）」上都不弹 —— 2026-10-08 需求把演示挪到链路最后，引导链路里排在演示收场之后）。弹的是默认态（永久会员 / 支付宝 / 未勾选协议 / 无弹层，走 openAppScreen 的复位）。**2026-10-06 再晚些需求（本轮）**：落首页后**等 1 秒再从底部滑出**（定时器 + 根节点 `.entering`；这一秒里离开首页就不弹），且**这一次没弹挽留弹窗时点叉号 / Esc 直接回首页**（state.pu2Launch；弹窗那条对自动弹出与手动入口一视同仁 —— 首启引导必弹、其余 1/4 随机、当天弹过则不弹）。实测（playwright 新会话 lclaunch1 ~ lclaunch3，本地 4173 `?view=device&surface=app`，393×852）：非会员在左栏开好三枚开关（开启键盘 / 完全访问 / 登录状态）后切键盘形态再切回主 App 形态（= appEntryCheck 落首页）→ 自动落「会员购买页 · 新」（.pu2-page 在屏、标题「成为LoveCo会员，解锁无限次AI使用」）；点叉号照旧弹「永久会员立减优惠」挽留弹窗、点它的 x 回「我的」；随后点底部「首页」Tab 不再弹。另两条落首页链路同样验证：左栏「当前输入法 · LoveCo」走完引导（finishGuide）→ 未登录先落登录页（**不弹**）→ 短信登录（获取验证码 → 登录 → 协议确认框「同意并继续」）收尾回首页 → 弹出；性别还没设置（「已设置性别」关着）走完资料引导（选性别 → 跳过生日，finishOnboarding）→ 落首页 → 弹出。反例：左栏「永久会员」摆成会员后重切形态 → 首页照常、不弹；关掉「登录状态」重切 → 停在登录页、不弹。`node --check app.js` 通过。**2026-10-08 需求改了引导链路的顺序**（「键盘使用引导（演示）」挪到最后）：上面两条引导来路现在会先走 完全访问 → 登录 → 资料引导，再开演演示，自动付费墙改在**演示收场那一下**才排；实测（playwright lcf1 / lcf2，393×852）页面列表点入「切换到 LoveCo 键盘」（完全访问已摆开、直接落登录）与左栏「首启引导」（真实 UI 走完，含完全访问层）两条链路各跑一遍，均落首页后 1 秒弹本页。'},
    {id:'purchase2-offer',group:'会员中心',name:'会员购买 · 优惠券',route:'/account/purchase2-copy（购买页的第二种形态 · 挽留弹窗）',trigger:'**「会员购买页 · 新」的第二种形态**（2026-10-06 需求补登记，页面本体仍是 `purchase2-copy` 那张购买页）：真实链路上点它的左上角叉号 `p2-close` 或按 Esc，命中弹窗条件就**不退出页面**、改弹这一层「永久会员立减优惠」挽留弹窗（`pu2OfferSheet` / `state.pu2Offer`）—— 命中判定见 leavePurchasePage（**首启引导必弹、其余情况随机 1/4 命中才弹、当天已弹过一律不弹**；首页等 1 秒自动弹出的那一次走另一条：点叉号 / Esc 直接回首页）；也能**从本列表点入**（setupPage 先 `openAppScreen("purchase2-copy")` 落购买页、再开这一层，倒计时照真实链路从 03:00 起跳；**只摆形态、不落库** —— 不消耗当天那一次真实机会，刷新即恢复，弹窗里的按钮走的仍是真实链路）',desc:'**不是另一个整页，而是「会员购买页 · 新」盖着挽留弹窗的那一形态** —— 购买页本体照旧在下面（标题 / 三档卡 / 续订说明 / 支付方式 / 兑换码 / 紫渐变主按钮 / 协议行都在），这一形态只多一层居中挽留弹窗，其余内容由深色蒙层压暗（`#10101A6B`，与协议确认框 `.pu2-ask` 同一套挂法：铺在 `.app-shell` 上、层级口径相同；购买页固定浅色，这一层配色写死、不跟随深色外观）。**功能**：① 右上角圆形 x（`offer-close`）= 放弃优惠 + **一并退出购买页**（自动弹出的那一次回首页、其余回「我的」，见 leaveOfferSheet），Esc 同一条 —— **2026-10-06 再晚些需求：放弃的那一刻优惠资格再保留 3 分钟**，首页浮出那颗可拖动的「限时特惠」悬浮卡兜住它（见本目录 `home` 条目 ⑤ 与 `offerBadge()`）；② **3 分钟倒计时**（`OFFER_SECONDS = 180`，进层即起跳、每秒只改 `#pu2-offer-count` 一枚数字不整页重渲染；归零自动收层、仍停在购买页、当天不再弹）；③ 「领取优惠」（`offer-claim`）= 记下优惠（`offerClaimed` 落库 → 永久档现价随即按立减 40 的 **¥128** 显示，见 `offerPrice()`）并**直接进入支付** —— 关层后走与「立即解锁」（`p2-buy`）同一条分路：未勾协议先弹协议确认框，点「同意」即勾上并继续；iOS 弹 iOS 系统支付框 / 安卓·鸿蒙一键到账。**设计**：浅紫垂直渐变卡（`#CBD5FD` → 近白，宽 82%、393 屏 ≈323px，22px 大圆角），自上而下 —— 20px 800 蓝标题「确定放弃永久会员立减优惠？」（`#577CFF`，居中）→ 红字倒计时一行（时钟图标 +「优惠剩余」+ 等宽数字）→ 权益四条（蓝圆白勾 + 14.5px 蓝字、逐条左对齐、整块缩进居中，文案见 `OFFER_BENEFITS`）→ 双色块（高 96、圆角 14：左块红对角渐变 + 两行白字「永久会员 / 立减优惠」，右块米→粉对角渐变 + 深灰大号「立减 ¥40」+ 右端条形码装饰）→ 紫粉渐变胶囊「领取优惠」（`#4C60F8` → `#FA6076`，高 46、宽 73%）；骨架与皮肤都在 theme.css 的 `.pu2-offer-*` 一组',note:'与上一条「会员购买页 · 新」是**同一页的两种形态**（同一个 purchase2-copy 页面 + 同一层弹窗，不是新做的购买页）—— 别当重复条目删掉，也别据此另做一张购买页；弹窗本体与上一条 desc 里的「永久会员立减优惠」挽留弹窗是同一份 DOM'},
    /* 「键盘权限」「登录」两组里的两条**键盘同款覆盖层**（2026-09-29 起登记进主 App 目录）：
       都是主 App 状态检查链的组成部分（真实链路会弹）—— 勿据此把「登录 LoveCo」整页补回。
       同日补登记的第三条「会员开通覆盖层」（app-paywall）已按需求从目录删除：主 App 2026-09-28 起
       就不弹这层（购买改走会员购买页），同层条目只留在键盘目录（kb-paywall）。 */
    {id:'app-full-access',group:'键盘权限',name:'完全访问引导层',route:'主 App › 整页覆盖层（状态检查链第二环 · 键盘同款）',trigger:'进入主 App 的状态检查链（appEntryGuards）第二环：键盘已开启但「键盘完全访问」没开（iOS / 鸿蒙；安卓系统默认就有、跳过这一环）时弹出 —— 先权限后登录，这一环通过才轮到登录层；或本列表点入（现场把「键盘完全访问」置成关、停在安卓时切到 iOS（安卓不弹这一层），不落库）',desc:'键盘同款的完全访问引导层（kb-full-access 组件）浮在 .app-shell 上、铺满正文区（主 App 形态不渲染键盘底栏，元素按整机尺度放大一档）：① 顶条 —— 底色与主体一致、不显示文字，只在最右侧放一枚圆形叉号（关掉这一层回原页）；② 标题「开启[允许完全访问]，AI 帮你回复」（鸿蒙端按系统叫法写「[完整访问]」）；③ 白色圆角卡里两张设置操作引导图的轮播（一轮 6 秒、交叉淡入淡出：系统设置列表红箭头点「键盘」行 → 键盘详情页红箭头点那颗权限开关），卡下蓝底白字「去开启」按钮',note:'与键盘形态共用同一组件（kb-full-access）与同一个开关 state.kbFullAccess（与登录层互斥）；「去开启」= 仿真开启完全访问（permissions.keyboard=true）并接着跑下一环登录检查；键盘形态的同层条目见 KB_PAGES「键盘权限与登录」组的 kb-full-access'},
    {id:'app-login',group:'登录',name:'手机号登录',route:'主 App › 独立页面（未登录时进入 · 键盘同款）',trigger:'未登录时的登录落点之一：启动 / 切进主 App / 点底部 Tab 走状态检查链最后一环时进入本页（「设备权限 › 蜂窝网络」关着 = 无卡 / 未开蜂窝网络），主 App 内各处需要登录的动作（needLogin）也进本页；**未登录点「我的」Tab 也落本页**（2026-10-04 需求：先进「我的」页、0.5 秒后按蜂窝网络开关在本页与另一张登录页之间二选一，见 `ACCOUNT_LOGIN_DELAY_MS`）；或本列表点入（现场置成未登录，不落库 —— 本页固定短信验证码形态；一键登录形态已拆成独立的「一键登录」页，见下一条）',desc:'键盘同款登录页整页直出的**独立页面**（kb-login 组件、appScreen=login —— 2026-09-29 三次需求起不再是覆盖层：当天早些时候它还叫「登录覆盖层」、更早的 2026-09-26 前是「登录 LoveCo」整页；底色同日定稿为整块通底淡蓝，原淡粉紫渐变），铺满整页、无底部 Tab 栏：右上角 X + 「手机号登录」页名 + 手机号 / 验证码两张胶囊输入框（验证码框内嵌「获取验证码」胶囊）+ 整宽「登录」按钮（11 位手机号 + 6 位验证码填齐才从淡紫禁用态变实色）+ 协议勾选行（只列**用户协议 / 隐私协议**两个简称 —— 2026-09-29 需求起链接文案改短、点开的正文页标题仍是《用户协议》/《隐私协议》，协议名点开协议正文（2026-10-04 需求：主 App 侧是**整页** —— appScreen=legal，返回箭头回登录页、勾选状态与表单都留着；键盘形态那一层仍是覆盖层 kb-legal）；**进页即未勾选**（同一条需求：手机号页面默认不勾选协议），**未勾选点「登录」不抖协议行，而是弹「请阅读并同意以下条款」弹框** —— 2026-09-29 需求：深色蒙层 + 居中白卡（右上角 X、居中标题、协议文案里协议名可点、底部整宽蓝色胶囊「同意并继续」，卡宽约屏宽七成、白卡 16px 圆角），点「同意并继续」= 视作勾选并接着把这次登录跑完、X / Esc 只收起弹框；键盘形态仍是抖协议行）。本页原来还兼演一键登录形态（表单随蜂窝网络开关二选一），2026-09-29 晚些按需求拆出去成了独立的「一键登录」页。右上角 X / Esc 关掉回来路页；登录成功先给一记「登录成功」提示，随后若性别还没设置（左栏「模拟 › 已设置性别」关着）就接「资料引导」（选择性别 → 你的出生日期），否则回来路页',note:'与键盘内登录层是同一组件、同一份状态（state.kbLogin）；主 App 形态是 appScreen=login 的整页、渲染在 .app-main 里（无底部 Tab 栏），键盘形态仍是从下往上弹出的覆盖层、只占键盘那一条；**协议勾选在主 App 是「每次进页清空」**（state.kbLoginConsent，见 openAppLogin / kb-login-sms —— 2026-09-29 需求：手机号页面默认不勾选协议），键盘形态仍是共用同一份勾选状态；2026-09-29 起「登录不再是页面」的口径作废 —— 手机号登录回到页面形态（页面本体就是键盘同款登录页）；键盘形态的同一层见 KB_PAGES「键盘权限与登录」组三条登录条目'},
    {id:'app-login-one-tap',group:'登录',name:'一键登录',route:'主 App › 独立页面（未登录时进入 · 键盘同款）',trigger:'未登录时的登录落点之一：启动 / 切进主 App / 点底部 Tab 走状态检查链最后一环时进入本页（「设备权限 › 蜂窝网络」开着 = 视为已插卡且有蜂窝网络），主 App 内各处需要登录的动作（needLogin）也进本页；**未登录点「我的」Tab 也落本页**（2026-10-04 需求：先进「我的」页、0.5 秒后按蜂窝网络开关在本页与另一张登录页之间二选一，见 `ACCOUNT_LOGIN_DELAY_MS`）；或本列表点入（现场置成未登录 + 蜂窝网络开，不落库 —— 本页固定一键登录形态，与键盘内一键登录弹窗同一套页面）',desc:'键盘内一键登录弹窗同一套页面整页直出的**独立页面**（kb-login 组件、appScreen=login-one-tap —— 2026-09-29 按需求从「手机号登录」页里拆出：原来两形态共挤一页、随蜂窝网络开关二选一，现在各占一页；底色同为整块通底淡蓝），铺满整页、无底部 Tab 栏：**X 顶条**（X 靠右独占一行，页内内容整体跟着下移）+ 居中大号本机号（state.phone，号码旁不标「上次登录」）+ 整宽蓝色胶囊主按钮「本机号一键登录」（**未勾选协议时点它不再抖协议行，而是弹「请阅读并同意以下条款」弹框** —— 2026-09-29 需求：深色蒙层 + 居中白卡（右上角 X、居中标题、协议文案带运营商认证协议三份、底部整宽蓝色胶囊「同意并继续」），点「同意并继续」= 视作勾选并接着把这次登录跑完、X / Esc 只收起弹框，不静默无反应；键盘形态的同一层仍是抖协议行）+ 居中的「手机号登录」圆角方块入口（**点它跳到独立的「手机号登录」页**，不再是键盘里的就地换表单）+ 底部协议勾选行（带**用户协议 / 隐私协议**两个简称 + 中国联通认证服务协议，协议名点开协议正文（2026-10-04 需求：主 App 侧是**整页** —— appScreen=legal，返回箭头回登录页、勾选状态与表单都留着；键盘形态那一层仍是覆盖层 kb-legal）；**进页即未勾选** —— 2026-09-29 需求：主 App 两张登录页默认不勾选协议，等同页底部「手机号登录」入口跳过去也不算已勾）。右上角 X / Esc 关掉回来路页；登录成功先给一记「登录成功」提示，随后若性别还没设置（左栏「模拟 › 已设置性别」关着）就接「资料引导」，否则回来路页',note:'与键盘内登录层是同一组件（state.kbLogin 记形态）；**协议勾选在主 App 是「每次进页清空」**（state.kbLoginConsent，见 openAppLogin / kb-login-sms），键盘形态仍是共用同一份勾选状态；两页之间互跳不算来路变更，X / Esc / 登录成功收尾都回到进第一页时记的那一页（appLoginReturn）'},
    {id:'profile',group:'账户与协议',name:'用户',route:'/account/profile',trigger:'「我的」页最上方的问候行（「你好 138****8000」/ 未登录时为「立即登录」，由 needLogin 拦到登录页）；本列表点入（现场摆成已登录，不落库）',desc:'**2026-10-04 按设计图重做的整页设置页**（原「个人资料」的昵称 / 性别 / 年龄段编辑表单按需求整体删除）：顶部一条页头（左侧圆形返回钮 → 回「我的」，中间居中标题「用户」）；正文三张白卡（无分组标题、卡间距 12px，卡内一行 = 47px 行的同款骨架、行高 52px）：① **用户 ID**（右值 + 一枚复制图标，点它把 ID 写进剪贴板、图标变勾约 1.2 秒后复原；**不带折角箭头**）+ 手机号（纯展示、无箭头）—— 2026-10-04 反馈：该行标签原为「会员 ID」、手机号原在第二张卡；② 性别（未设置时灰字「未设置」、点开二选；**设置后不可修改** —— 行不可点、也不画箭头）+ 出生日期（未设置时灰字「未设置」，设置前后都可点开滚轮改）；③ 注销账号（**整行文字 2026-10-04 按反馈转灰** —— 行渲染器的 muted 变形，行尾折角箭头仍是同一档灰；点它进**注销账号页** —— 2026-10-04 晚些需求：注销链路按新设计图重建为独立整页 + 成功弹框，见 `cancel-account` 条目）；**页尾单独一张「退出登录」卡**（蓝字居中，走既有 logout：清会话 → 回首页并进登录页；2026-10-04 反馈：整页撑满一屏高、这张卡沉在正文底，与底部 Tab 栏保持固定间距）。**性别 / 出生日期两行点开就地弹层编辑**（底部卡片，X / Esc 只收层）：性别 → 男 / 女两行点即改并收层；出生日期 → 三列滚轮（年 1980–2015 / 月 / 日，与资料引导第二步同一套 scroll-snap 骨架与「N岁 星座」实时行、选中带在弹层里换浅灰底）+「保存」写回 state.birthday（顺带对上 age 档）',note:'性别与资料引导（onboard-gender）是同一个值、生日与「你的出生日期」（onboard-birthday）是同一个值；性别仍是对象编辑页「性别默认取反」的依据；昵称按 2026-10-04 反馈不再在本页显示、也没有改昵称的入口（改名弹层与 PATCH /v1/me 同去），但仍留在存档里、同步到聊天页「我」的头像兜底与各处显示；用户 ID（state.memberId，行标签原「会员 ID」）是跟着存档走的展示值（默认 7297034，与设计图一致）。原「年龄段（选填）」字段随本页改版不再显示（state.age 只留在存档里）'},
    {id:'invite',group:'账户与协议',name:'邀请有礼',route:'/account/invite',trigger:'「我的」·「账户」组·「邀请有礼」行（`invite` 动作，未登录先由 needLogin 拦到登录页）；本列表点入（现场摆成已登录，不落库）',desc:'**2026-10-05 按需求新增的邀请码功能页**（此前那一行只浮「即将上线」轻提示）。**功能**：一条「双方各得 3 天」的邀请链路 + 阶梯奖励，四个模块自上而下 —— ① **专属邀请码**（state.inviteCode，默认 LC7K2M，落库）：Hero 里的大字码 + 「复制邀请码」胶囊 + 「复制邀请文案」幽灵按钮（文案由 inviteMessage 自动生成、含本人的码；复制后按钮文案变「已复制」约 1.2s，并浮一记轻提示「邀请码已复制」/「邀请文案已复制」）；② **填写邀请码**（被邀请方视角）：输入 6 位码点「领取」走校验链 —— 空 / 格式（非 6 位字母数字）/ 自己的码（不能自邀）/ 已领取过（每人仅限一次）/ 无效码（INVITE_DEAD_CODES，原型约定 LC0000 演示这一态）/ 通过 → 立即到账 3 天会员（grantInviteDays：非会员从此刻起算、有效会员在原到期日上顺延、永久会员不叠加），随后填写区整块换成成功态（绿底圆勾「3 天会员已到账」+ 已用好友的码 + 会员到期日），不再显示输入框；③ **我的邀请**（邀请方视角）：顶部「已到账 N 人」+ 阶梯进度条（按 5 人档折算）与三档节点（1 人 +3 天/人、3 人 +7 天、5 人 +15 天，达成转品牌蓝）+ 下一档提示行（「再成功邀请 N 位好友，额外得 X 天会员」），下接邀请记录列表（每条 = 掩码手机号 + 状态徽标 —— **好友侧没有头像与昵称、只有手机号**，所以不画头像、主文字就是手机号：「已到账 +3 天」绿徽标 / 「待激活」灰徽标（两枚徽标配色 2026-10-06 当天四轮定稿：实心底 + 白字 —— 绿 #12A56A / 中性灰 #75757F，见 README 需求记录同日四条）—— 待激活 = 好友已填码、还没用过 AI）+ 列表下一行说明「好友首次使用任意 AI 功能后，奖励自动到账」；④ **活动规则** 7 条（口径：填码立得 3 天 / 好友首次用 AI 后邀请人得 3 天 / 满 3·5 人额外 7·15 天 / 关系绑定不可换 / 权益顺延且永久会员不叠加 / 违规撤销 / 最终解释权），默认只露前 3 条，点「展开全部规则」看全、再点「收起」。**设计**：浅色通版、跟随深色外观（走通用画布 + 白卡，不另开按图定色皮肤），保留底部 Tab（高亮「我的」）；页头复用「用户」页骨架（圆形返回钮 + 居中标题「邀请有礼」）；四块主体 —— **蓝紫渐变 Hero**（与「我的」会员横幅同色系 #6577F0→#4C5CE6、圆角 16px + 蓝投影）里白标题 17.5px「邀请好友，各得 3 天会员」+ 半透明副标题，下接**白底邀请码卡**（小字「我的专属邀请码」+ 24px 加粗品牌蓝大字码（字距 3px）+ 蓝底白字「复制邀请码」胶囊），幽灵按钮「复制邀请文案」整宽 38px（半透明白底 + 白描边）；三张白卡卡间距 14px、卡内 14px 内边距，阶梯进度块浅灰底 12px 圆角、进度条 6px 胶囊；校验失败态 = 输入框红描边 + 红底 + 下方红字提示行（警告图标 + 文案）；成功态 = 绿底块（圆勾 + 「3 天会员已到账」+ 小字两行）；状态徽标 999px 胶囊（**实心彩底 + 白字** —— 2026-10-06 第三轮定稿：绿 #12A56A 与琥珀金 #E88410 两枚实心色是本页固定色、不走 --lc-*-soft 令牌）。其余配色走 --lc-* 令牌（深浅色两套），固定色只有 Hero 渐变、码卡白底与这两枚徽标实心色（同会员横幅的白胶囊口径）',note:'奖励发放口径三处同源：填码立得 3 天（INVITE_DAYS）、每位好友到账 3 天、阶梯 3 / 5 人额外 7 / 15 天（INVITE_STEPS）—— 改规则只改这三个常量与 INVITE_RULES 一张表（规则第 3 条的天数由常量生成）。原型仿真约定两条：① 「无效码」用 LC0000 演示（真机上是服务端查无此码 / 活动已结束）；② 「待激活 → 已到账」与阶梯补发由左栏「模拟 › 模拟好友使用AI」推进（见 simInviteUse：把一位待激活好友置为已使用 AI、+3 天到账；没有待激活好友时新加一条已到账记录；达标档位按 inviteStepsClaimed 防重复发放）—— 真实链路由服务端在好友首次调用 AI 时回调发放。落库字段四个：inviteCode / inviteClaim / inviteFriends / inviteStepsClaimed（其余为页面内存，见 state 顶部说明）；预设两条演示记录（138****6688 已到账 + 137****2233 待激活），领取后刷新不丢'},
    {id:'cancel-account',group:'账户与协议',name:'注销账号',route:'/account/profile/cancel',trigger:'「用户」页第三张卡的「注销账号」行（user-cancel）；本列表点入（现场摆成已登录、与「用户」页同一来路，不落库）',desc:'**2026-10-04 按设计图新增的独立整页**（注销链路 2026-09-26 曾整体删除，现按新设计图重建 —— 不再是旧的确认框形态；无底部 Tab、整页白底、状态栏连着转白）：自上而下：① 页头（左侧圆形返回钮 → 回「用户」页，中间居中标题「注销账号」，复用用户页页头骨架）；② 正文（左对齐、无卡片）：加粗句「为保证您的权益，请阅读以下内容」+ 两句说明（注销后个人资料 / 使用记录等关联数据永久删除、无法恢复；无法再使用本账号、也无法找回相关信息）+「包括并不限于」两条清单（个人信息 / 当前账号中维护的聊天对象资料；2026-10-04 晚些需求：原第二条「历史缓存图片」改成这条、第三条「与微信·苹果等第三方账号的绑定关系」整条删除）+ 加粗句「注销账号，需满足以下条件：」+ 两条条件（账号处于正常使用状态 / 账号财产已结清；正文说明字号 2026-10-04 晚些按需求调小一档 —— 加粗句 15px / 段落 13px）；③ 沉底一组：灰色小字「我已阅读并同意《账号注销协议》」+ 整宽蓝色胶囊「确认注销」（2026-10-04 晚些需求：协议名由纯文字改成**可点文字按钮**，点它打开协议正文 —— 正文取 legal-data.js 的 `cancel` 快照《用户注销协议》（线上 /agreement/cancel 全文）；**2026-10-04 晚些那版是浮在页面上的覆盖层，同日改整页后变成进协议正文页、返回箭头 / Esc 回本页**）。**点「确认注销」弹「注销申请成功」弹框**（state.cancelAsk）：深色蒙层 + 居中白卡（标题 + 「7 天内为账号注销冷静期，7 天内再次登录视为放弃注销」两行说明 + 居中蓝色胶囊「知道了」），**点「知道了」收起弹框并回首页**；弹框没有 X，Esc 也只收弹框、仍停在注销页。深色外观下本页固定浅色（同购买页 / 登录页，配色写死在 theme.css）',note:'从「用户」页进入、返回也回「用户」页；注销申请只是提交（7 天冷静期）、**不清会话也不改账号状态**，未登录也可静态查看本页'},
    {id:'feedback',group:'账户与协议',name:'问题反馈',route:'/feedback',trigger:'「我的」· 支持 ·「反馈与建议」（2026-10-04 晚些：栏目由「客户支持」改名「支持」；同组另一行是「联系客服」，弹客服弹层、不进本页 —— 原「键盘内容投诉与举报」那条预选来路已删）',desc:'**2026-10-04 按设计图从 sheet 卡片重做的深色整页**（页名同日从「反馈与建议」改成设计图上的「问题反馈」；设计图右上角那颗「我的反馈」按需求**不呈现** —— 原型里没有反馈历史页，重做后的页内也没有任何反馈历史入口）。**功能**：① 问题类型是一排胶囊按钮（**功能问题 / 键盘问题 / AI 效果 / 建议 / 投诉与举报** —— 最后一类是本轮需求新增，原有的「投诉」「举报」两类合成它；**2026-10-04 晚些需求起不再有入口预选它** —— 「我的 · 键盘内容投诉与举报」那一行已删、同位置换成「联系客服」，进页默认落在「功能问题」）点一颗即换选（feedback-type:<类型>）；② 问题描述多行输入（占位「请尽量描述复现步骤、期望结果和手机型号」，上限 1000 字、右下角实时计数 n/1000；**2026-10-04 后续需求：两处占位字号改为 13px / 行高 18px，与页内标签同档** —— 原随输入框 15px）；③ 联系方式单行输入（占位「联系方式（可选）」，上限 200 字、右下角计数 n/200）；④ 整宽蓝色「提交反馈」提交（POST /v1/feedback，成功回「我的」；描述不足 5 字不提交、焦点交回描述框）。草稿（类型 / 描述 / 联系方式）存在 state 里：换类型重渲染不丢已输入内容，**每次进页开一张新表单**（openAppScreen 里清场，原 sheet 那套 formCache 缓存已撤）。**设计**：整页深色（配色照设计图写死、**不跟随深色外观开关** —— 同购买页 / 登录页 / 注销页 / 协议页那种「按图定色」的做法）：底色 #111318、卡面与未选胶囊 #1C1F26、描边 #2A2E36、强调蓝 #4C8DFF（选中胶囊与提交按钮同色）；页头是返回箭头 + **居中标题「问题反馈」**（复用用户页 .user-head 骨架）；页边距 20px，类型胶囊 36px 高（全圆角、13px 字、横 10px 纵 20px 间距）、描述框 174px 高（15px 字、占位灰 #6F7580）、联系方式行 54px 高、提交按钮 52px 高（16px 字）；计数行（13px，#C2C3CD）右缘比卡右缘再内收 20px（设计图页尾那行 12px 居中灰字说明「提交后由客服团队处理…」已按 2026-10-04 后续需求删除，勿补回）。无底部 Tab 栏、状态栏连着转深色（.guide-feedback），返回箭头 / Esc 的同一条出口回「我的」',note:'提交成功后回「我的」页（原落点「我的反馈」页与反馈历史记录已删除，反馈不留历史列表）；页面尺寸与配色按设计图量出（393×852 口径），改样式时对照 theme.css 的「问题反馈页」一组'},
    {id:'about',group:'账户与协议',name:'关于 LoveCo',route:'/account/about',trigger:'「我的」·「更多」·「关于 LoveCo」行（appRowSub 的 action=\'about\'）；本列表点入（不落库）',desc:'**2026-10-04 晚些按设计图新增的整页**（此前这一行只是「我的」页尾的纯展示行）：自上而下 ① 页头（左侧圆形返回钮 → 回「我的」+ 居中标题「关于 LoveCo」，复用用户页 .user-head 骨架）；② **品牌区**（**LoveCo 图标** `assets/brand/LoveCo_128_128.png` 72px 圆角方块 → 应用名「LoveCo」→ 灰字版本号 **Version 1.9.0**，取 APP_VERSION 常量）—— **2026-10-06 需求起这一整组在页头与备案行之间纵向居中、并在居中之位再上移 48px**（.about-hero 的 flex:1 + justify-content:center，图标 / 应用名 / 版本号落在正文区的视觉中心；同日追加需求「位置在往上移一移」—— 皮肤内边距 14px 0 → 14px 0 110px，多出的 96px 下内边距把整组在居中基准上再抬一半 = 48px）；③ 页尾**沉底**的 APP 备案信息「APP 备案编号：鄂ICP备2026043044号-2A」（APP_ICP 常量，靠 margin-top:auto 贴正文底）。**2026-10-06 需求：原先在品牌区与备案行之间的「隐私与协议」卡片整块删除**（用户原话「关于 LoveCo页面删除 隐私与协议，然后 icon 和版本号居中」）—— 那张卡原有四行（用户协议 / 隐私协议 / 个人信息收集清单 / 第三方信息共享清单，行名取 legal-data.js 的 title、顺序见常量 ABOUT_LEGAL_KEYS、行与「我的」页同一套 .app-row 且不带行首图标、点行进对应协议正文整页），现连常量一起删掉；四条协议正文的入口只剩「我的」·「隐私与协议」组（协议快照本身保留 —— kb-paywall、购买页协议行、注销页仍在读；2026-10-04 需求更早删过这张卡里的《会员与积分协议》《VIP会员自动续费服务协议》两行）。无底部 Tab；走通用浅灰画布 + 白色卡片，**跟随深色外观**（不另开写死配色的皮肤）',note:'**设计图里三块按需求不呈现**：应用描述那两行、「联系客服」按钮、协议行左侧的小图标（图标那份设计图是「关于LoveCo键盘」参考页的形态；协议行本身 2026-10-06 已随卡片整块删除）；版本号取 APP_VERSION（改版本只改一处；「我的」页「更多」组那一行的副说明 2026-10-06 已按需求删掉）；本页不读登录态，返回箭头 / Esc 都回「我的」（同 feedback 的出口）'},
    {id:'legal',group:'账户与协议',name:'协议正文',route:'/legal/:key（本列表固定看《用户协议》）',trigger:'「我的」· 隐私与协议四条直链（用户协议 / 隐私政策 / 个人信息收集清单 / 第三方信息共享清单）、注销页「我已阅读并同意《账号注销协议》」、两张登录页的协议勾选行与「请阅读并同意以下条款」弹框里的协议名、会员购买页的协议行；本列表点入（现场摆成从「我的」点进的《用户协议》，不落库）',desc:'**协议正文整页**（2026-10-04 按设计图重做，route 回到 /legal/:key 口径）：① 页头**只有一枚返回箭头**、**常驻顶部**（2026-10-04 晚些需求：正文往下滚时页头钉在正文区顶部、不跟着滚走 —— .lg-head 的 position:sticky，骨架在 styles.css）—— 没有页名、没有 X（原 sheet 头那行协议名与页尾那颗整宽「返回」按钮一并去掉），协议名改在正文首行用 **27px 加粗大标题**承担；② 正文按空行分段、左对齐，**宋体** 15.5px / 行高 1.95（标题与正文都排宋体，与设计图一致），首行那份与标题重复的协议名在渲染时去掉（legalParagraphs，判据「首行不含句读且不超过 40 字」）。整页白底、无底部 Tab、状态栏连着转白；页面上**没有**「项目内置协议快照；模拟器本身不提供真实付费服务。」那条说明（模拟器口径只留在工作台与 README）。正文与键盘内 kb-legal 同一份快照（legal-data.js，8 份）',note:'返回箭头 / Esc 都回打开它的那一页（state.legalFrom）—— 从「我的」进的回「我的」、从注销页进的回注销页、从登录页 / 购买页进的回那一页（输入的表单、协议勾选状态、所选档位都留着；原「关于 LoveCo」页的协议卡 2026-10-06 需求已删，不再是来路）；2026-09-26 ～ 2026-10-04 之间它是浮在页面上的 sheet 覆盖层（state.appLegal），本轮改回整页后覆盖层字段与 legalSheet 一并删除；**同日晚些「协议中心」列表页（legal-list）按需求删除** —— 卡片末行入口与 appLegalListPage 一并去掉，这份正文页保留'},
    {id:'partners',group:'聊天对象',name:'聊天对象',route:'/partners',trigger:'主 App 底部 Tab 第二项「对象」；编辑保存后回到这里',desc:'对象管理列表（整页，纯管理）：标题行一行「聊天对象」+ 右侧「新建」文字按钮 —— 标题行下**没有**「当前上下文：…」那行说明，列表里也**没有「不选择」行**（清空 / 切换当前上下文只在键盘形态的管理页里做）；每行 = 圆形头像（没设自定义头像的一律用默认头像插画，2026-10-06 起统一换成用户提供的那张中性线稿图）+ 备注名，**只有写过备注的对象才多一行备注**（最多两行 —— 没备注的行不占位、不写「还没有备注 —— …」提示语；**性别 · 关系阶段不在列表里出现**，进详情页才看得到）；顺序按最近操作在前（新建的排最前，编辑过的保存后提到最前）。**整行（含头像）都是点击区**：按下时整行铺一层淡紫高亮（`.partner-open:active`，不再画头像描边的选中态），松手进该对象的**详情页 = 编辑页**（字段预填，可改、底部只有一颗不带图标的「确定」）—— 点行**不改当前上下文**；左滑露出编辑 / 删除（从行右侧滑入、盖在行内容上，删除直接执行不二次确认，「编辑」与行点击同一动作）',note:'与键盘形态的管理页是同一份数据、同一套排序、同一套左滑动作，只是主 App 下渲染为整页；「不选择」条目与「切当前对象」只在键盘形态的管理页里 —— 两种形态的行点击语义不同：主 App 进详情（编辑页），键盘切当前对象'},
    {id:'partner-new',group:'聊天对象',name:'新增聊天对象',route:'/partners/new',trigger:'主 App「聊天对象」页右上角「新建」',desc:'对象编辑页（整页，底部「确定」保存并回到对象列表、该对象排最前）：头像槽（点它从本地选图上传，选完居中裁成方形）、备注名、**性别**（下拉：暂不设置 / 女 / 男 —— 新建态默认取当前用户性别的「反」，用户是男默认女、用户是女默认男，用户自己还没设置性别时落到「女」）、关系阶段（五档，默认「熟悉」）、**备注信息多行输入框**（提示语「写下 TA 的年龄、职业、爱好，例如「28 岁，设计师，喜欢露营和看展」。写得越细，AI 越懂 TA。」），表单是白色圆角卡片、字段自上而下单列排布；标题行右侧一枚**退出 X**（图标钮 `.icon-btn`，title / aria-label「退出」，`data-action="close"` —— 不保存直接回上一层，从对象列表点进来就回对象列表）；底部「确定」是一颗**不带图标**的整宽主按钮（此前的对勾符号按需求去掉）',note:'与键盘版编辑面板（kb-partner-editor）对应但字段更多：键盘版只有备注名 + 关系阶段、改动即静默保存；主 App 版保留性别与备注信息两个字段（性别默认取反、备注提示语带年龄 / 职业 / 爱好三个关键词），仍是「确定」保存'},
    {id:'partner-edit',group:'聊天对象',name:'编辑聊天对象',route:'/partners/edit',trigger:'主 App「聊天对象」页点对象行（进详情）或对象行左滑「编辑」',desc:'与「新增聊天对象」同一表单的编辑态：字段预填对象当前值（含头像「更换头像」、性别与备注信息），「确定」保存回列表并把该对象提到最前；标题行右侧同样有**退出 X**（同一颗图标钮，不保存即回上一层）；**页内没有「删除这个对象」入口**（按需求去掉，原确认框链路 delete-partner / delete-partner-confirm 一并删除 —— 删除对象只走列表左滑那颗直接删的按钮）',note:'主 App 与键盘版的编辑面板现在都不给删除入口（键盘版更早去掉）—— 删除只走列表左滑，直接删、不二次确认'},
    /* 「开启键盘」引导流程（2026-09-27）：进入主 App 按状态检查链走，键盘未开启就整页进这条流程。
       引导页按需求拆成**三端各一条**（形态大致相同、各有差异，见各条 desc）：演示动画素材
       按运行平台取（三端各一支，安卓版 2026-09-28 补入，见 GUIDE_VIDEOS；**引导第二步
       2026-09-28 起不放演示视频**，卡与卡下说明一并去掉，操作提示改由键盘切换悬浮窗里给）；
       鸿蒙 / iOS 是一步形态（一颗按钮），**安卓是两步形态**（两颗按钮 —— 键盘启用后再切换
       当前输入法，见 appGuideHome / guideStepState；第二步 2026-09-28 起有自己的落点：
       键盘切换悬浮窗 kb-guide-ime-switch）；两页模拟系统设置按端分叉（2026-09-28 起
       —— iOS 有自己的一版：设置页 kb-guide-settings-ios、键盘权限页 kb-guide-detail-ios）。 */
    {id:'kb-guide',group:'开启键盘引导',name:'开启键盘 · 引导页(鸿蒙)',route:'/kb-guide?platform=harmony',trigger:'进入主 App：按**状态检查链**走（键盘权限 → 键盘完全访问 → 登录状态，见 appEntryGuards），第一环没过（左栏「设备权限 › 开启键盘」关闭）时整页进这条引导；或左栏「模拟 › 首启引导」开关打开（一键把设备摆成新机、主 App 随即落这一页，见 firstLaunchReset）；本列表点入（切到鸿蒙，并现场把「开启键盘」置成关、完全访问一并复位（摆成一台还没启用键盘的新设备），不落库）',desc:'紫蓝色整页（无底部 Tab 栏），**全页元素整体上下居中**（不挤在顶部；内容比屏高时自然从头排、可滚动），自上而下：① 中央白色大圆角卡内嵌**演示动画视频**（循环播、**带声音** —— 素材自带音轨，只是浏览器禁止「有声音的自动播放」，所以先静音起播、拿到用户手势（页面上点过任何一处即算）随即开声音，见 app.js 的 wireGuideVideos；鸿蒙版素材 assets/Enable LoveCo Keyboard HarmonyOS.mp4，画面即「在输入法管理中启用 LoveCo」的操作演示）；② 卡下一行白色小字说明「在「输入法」管理中，启用LoveCo输入法」（不写「第1步」）；③ 黑色胶囊主按钮「启用LoveCo输入法 →」—— 整颗**持续放大缩小、一闪一闪**地引导点击（kg-breathe：1.6s 一个来回，scale 1 ↔ 1.045 配深蓝呼吸投影），点它进模拟鸿蒙设置页。鸿蒙引导页只有这一颗按钮（原「切换到LoveCo输入法」幽灵按钮已按需求删除；安卓版是**两步两颗按钮**的另一套形态，见 kb-guide-android）：完成引导改由「从系统设置返回 App」触发 —— 在设置里打开「启用LoveCo」后，点左下角视频悬浮窗**或设置页左上角的返回箭头**才做「回到 App」那一刻的校验：键盘已启用的话，iOS / 鸿蒙落到**第二步整页「切换到 LoveCo 键盘」**（kb-guide-switch），长按地球切到 LoveCo 后依次走 完全访问 → 登录 → 资料引导 → **「键盘使用引导（演示）」**，演示收场才算引导完成、落首页（2026-10-08 需求：演示挪到链路最后，见 guideAfterSwitch；2026-09-29 需求：原「完成」胶囊已删）（两处是同一处「回到 App」校验；原左栏「模拟 › 返回主 App」按钮已按需求删除 —— 2026-09-28 需求：模拟设置页 / 详情页里的开关只改设备状态，主 App 感知不到权限变化 —— 不弹完全访问引导层、也不完成引导，回到 App 那一刻才重新校验，见 guideBack / guidePipBack）',note:'整页落在 appScreen=kb-guide 上，正文与状态栏连成一片紫蓝（状态栏文字转白）；Esc 不提供出口，只能走页面自身的按钮与返回。第二步选完 LoveCo 后接着跑状态检查链的后两环 —— 键盘完全访问 → 登录状态，再走资料引导，最后是「键盘使用引导（演示）」；没过就停在对应引导层上（**2026-10-08 需求把演示挪到链路最后**，见 guideAfterSwitch / finishGuide / appEntryGuards）'},
    {id:'kb-guide-android',group:'开启键盘引导',name:'开启键盘 · 引导页(安卓)',route:'/kb-guide?platform=android',trigger:'进入主 App：按状态检查链走（键盘权限 → 键盘完全访问 → 登录状态，见 appEntryGuards），第一环没过（键盘未开启）时整页进这条引导；或左栏「模拟 › 首启引导」开关打开（一键把设备摆成新机、主 App 随即落这一页，见 firstLaunchReset）；本列表点入（切到 Android，并现场把「开启键盘」置成关、完全访问一并复位、当前输入法复位成系统默认（摆成一台还没启用键盘的新设备），不落库）',desc:'与「开启键盘 · 引导页(鸿蒙)」共用同一条渲染链路 appGuideHome（拆条是为了分头补各端差异），但安卓是**两颗按钮的两步形态**（2026-09-27 起；2026-09-28 起第二步有了自己的落点）：紫蓝整页、白圆角大卡循环播演示动画、元素整体上下居中。演示卡**只在第一步出现**：第一步（键盘未启用）播 GUIDE_VIDEOS 里那一支（安卓版素材 `assets/Enable LoveCo Keyboard Andriod.mp4`，2026-09-28 补入、此前回落鸿蒙那支）、卡下一行说明写「在「输入法」管理中，启用LoveCo输入法」；**第二步（键盘已启用）既不放演示视频、也不放卡下说明**（2026-09-28 需求去掉视频框 —— 原先那支「切换到LoveCo输入法」的演示片一直没素材、只摆着同比例空占位卡，现在整个去掉，改由「键盘切换悬浮窗」弹框顶部那行提示「选择 LoveCo 输入法」指路，见 kb-guide-ime-switch）—— 这一步页面上只剩两颗按钮。按钮自上而下：① 黑胶囊「**第一步 启用LoveCo输入法 →**」；② 同款黑胶囊「**第二步 切换到LoveCo输入法 →**」。两颗**状态互斥、只有轮到的那颗亮**（kg-breathe 持续放大缩小、一闪一闪；没轮到的那颗置灰、不可点、不跳动，见 .kb-guide-btn:disabled）：① 键盘未启用（左栏「设备权限 › 开启键盘」关闭）时第一步亮、第二步灰 —— 点第一步进模拟安卓设置页（kb-guide-settings-android）启用键盘；② **键盘已启用但「当前输入法」还不是 LoveCo 时**（安卓系统不允许 App 直接切输入法，得由用户自己走这一步）第一步置灰、第二步亮 —— 点第二步弹出**键盘切换悬浮窗**（kb-guide-ime-switch，在系统输入法选择器里选 LoveCo）；③ 两步都完成 → 引导页没有可做的了，**完成引导的落点是「键盘使用引导（演示）」页**（2026-09-29 需求：完成第二步不直接回首页；**2026-10-08 需求又把演示挪到链路最后** —— 切输入法那一步在键盘切换悬浮窗里选完 LoveCo 即第二步达成，先补状态检查链后两环（安卓没有完全访问这一环、只剩登录）→ 资料引导（性别 / 出生日期，新设备必走）→ 最后才**开演整机演示层**从头演「截图 → 唤键盘 → AI 分析 → 选回复 → 发送」（见 kb-usage-guide / guideAfterSwitch），**演示收场（「去使用」/ Esc）才算引导完成**、落主 App 首页 + 等 1 秒弹会员购买页）（安卓的两步都在这张引导页 / 悬浮窗上 —— 它没有 iOS / 鸿蒙那种第二步整页，见 kb-guide-switch；判定见 guideStepState / guideSatisfied；主路径：悬浮窗选完 LoveCo → 走引导后半段，见 pickGuideIme / guideAfterSwitch / closeKbUsageGuide —— 与 iOS / 鸿蒙在「切换到 LoveCo 键盘」页选完 LoveCo 是同一套走向；左栏仿真开关把两步摆齐则同样接这一段（见 finishGuideIfDone）；后续仍是状态检查链的收尾：登录；**安卓没有「键盘完全访问」这个权限**（系统侧默认就给到），键盘一启用即视同连它一起有 —— 这一环在安卓下直接通过，见 syncFullAccess / fullAccessGranted）。**从模拟设置页退回引导页那一刻会按当前键盘状态切到第二步**（2026-09-28 需求：真实设备上 App 也只能在自己回到前台时才得知键盘已开）：键盘已启用就**收起演示卡与卡下说明**（第二步不放演示视频）、并**自动弹出键盘切换悬浮窗**（当前输入法已是 LoveCo 就不弹，没什么可切的）；引导流程里的操作不会当场完成引导（模拟设置页只改设备状态，App 感知不到）。**安卓引导页与它的模拟设置页都没有视频悬浮窗**（2026-09-28 需求：进模拟设置页不启动悬浮窗），出口是设置页左上角那枚返回箭头（离开系统设置即回到 App：键盘已启用就换第二步、并自动弹出键盘切换悬浮窗，见 guideBack）。平台外观随运行平台（Android 无平台底栏、状态栏圆点挖孔）；模拟设置页已按端分叉（2026-09-28 起 iOS 见 kb-guide-settings-ios、安卓见 kb-guide-settings-android），键盘权限页同样按端分叉（iOS 版见 kb-guide-detail-ios，安卓仍与鸿蒙共用 kb-guide-detail）',note:'「当前输入法」在左栏「设备权限」里也能手动切（系统默认 / LoveCo，默认系统默认）—— 选 LoveCo 会顺带把「开启键盘」打开；反向关掉「开启键盘」则当前输入法复位成系统默认。两步的演示素材：第一步的安卓版已补（GUIDE_VIDEOS.android，2026-09-28）；**第二步不放演示视频**（2026-09-28 需求去掉视频框 —— 视频卡与卡下说明一并删除，那支演示片也没人再等，指路改由键盘切换悬浮窗弹框顶部的提示承担，见 kb-guide-ime-switch）。完成第二步（悬浮窗选完 LoveCo）不直接回首页 —— 接着走引导后半段（完全访问在安卓直接过 → 登录 → 资料引导 → 最后才是「键盘使用引导（演示）」），演示收场才完成引导（2026-09-29 需求 + **2026-10-08 需求把演示挪到链路最后**，见 pickGuideIme / guideAfterSwitch）。'},
    {id:'kb-guide-ios',group:'开启键盘引导',name:'开启键盘 · 引导页(ios)',route:'/kb-guide?platform=ios',trigger:'进入主 App：按状态检查链走（键盘权限 → 键盘完全访问 → 登录状态，见 appEntryGuards），第一环没过（键盘未开启）时整页进这条引导；或左栏「模拟 › 首启引导」开关打开（一键把设备摆成新机、主 App 随即落这一页，见 firstLaunchReset）；本列表点入（切到 iOS，并现场把「开启键盘」置成关、完全访问一并复位（摆成一台还没启用键盘的新设备），不落库）',desc:'与「开启键盘 · 引导页(鸿蒙)」**同一形态**（拆成三端条目是为了分头补各端差异，共用同一条渲染链路 appGuideHome）：紫蓝整页、白圆角大卡循环播演示动画、一行说明「在「输入法」管理中，启用LoveCo输入法」、唯一黑胶囊主按钮（kg-breathe 呼吸动画；iOS 一步完成，**安卓版是两步两颗按钮**，见 kb-guide-android）、元素整体上下居中。**iOS 差异**：演示动画素材按平台取 —— iOS 用自己的录屏 `assets/Enable LoveCo Keyboard IOS.mp4`（2026-09-28 起，此前素材未提供、回落到鸿蒙那支；引导页大卡与模拟设置页 / 详情页左下角的悬浮窗同一支，见 GUIDE_VIDEOS 的 ios 键）；**模拟设置页已按设计图补入 iOS 版**（`kb-guide-settings-ios` —— iOS 按 App 分组、没有「输入法管理」列表那一套，点「键盘」行进 iOS 版键盘权限页；此前这一页暂共用鸿蒙样式），**键盘权限页也已按设计图补入 iOS 版**（`kb-guide-detail-ios`「系统-键盘权限 (ios)」—— 导航条「‹ LoveCo 键盘 / 键盘」+ 一张卡两行开关：「LoveCo 键盘」「允许完全访问」，此前与鸿蒙共用一页）；完成引导同鸿蒙 —— 在设置里打开「启用LoveCo」后，点悬浮窗或设置页左上角的返回箭头才做「回到 App」那一刻的校验：键盘已启用就落到**第二步整页「切换到 LoveCo 键盘」**（kb-guide-switch，长按地球切到 LoveCo 后依次走 完全访问 → 登录 → 资料引导 → **「键盘使用引导（演示）」**，演示收场才落首页 + 等 1 秒弹会员购买页；**2026-10-08 需求把演示挪到链路最后**，见 guideAfterSwitch；2026-09-29 需求：原「完成」胶囊已删；此前「系统侧启用即完成」的判定已作废，见 guideBack / guidePipBack）；平台外观随运行平台（状态栏药丸挖孔 / 灵动岛、键盘底栏是地球 + 语音输入）',note:'演示素材已就位（GUIDE_VIDEOS.ios）；两页模拟系统设置都已按端分叉（2026-09-28 起 iOS 走 kb-guide-settings-ios / kb-guide-detail-ios —— appKbGuideScreen 里按 state.platform 选页）'},
    /* 「切换到 LoveCo 键盘」页（2026-09-28 按设计截图补入）：iOS / 鸿蒙引导的**第二步**
       （同一页 appGuideSwitch 只演「切换前」那一刻：底下固定是系统英文键盘。
       「已切到 LoveCo」列表条目 2026-09-29 已删，同日**连形态本身也一并删除** ——
       在本页的选择器里选完 LoveCo 不再就地换形态，直接进「键盘使用引导（演示）」页、
       演示收场即完成引导，见 appGuideSwitch / pickKbSwitch / closeKbUsageGuide）。 */
    {id:'kb-guide-switch',group:'开启键盘引导',name:'切换到 LoveCo 键盘',route:'/kb-guide?step=switch（iOS / 鸿蒙共用）',trigger:'iOS / 鸿蒙引导流程的**第二步**：在模拟设置页里启用键盘后「回到 App」（设置页左上角返回箭头 / 左下角悬浮窗）—— 键盘已启用、但当前键盘还不是 LoveCo（`permissions.ime` 不等于 loveco）时，主 App 整页落到这一页（安卓不走这一页，它的第二步是「键盘切换悬浮窗」）；或从本页弹出的键盘选择器点「更多键盘设置…」进设置页后再按返回；本列表点入＝现场摆成那一刻（键盘已启用 + 当前键盘系统默认 + 页面默认形态，不落库）',desc:'**整页蓝底**（`#5B68F5` —— 与引导第一步同一块紫蓝，2026-09-29 需求：原白底改成蓝色；状态栏一起转蓝白字，`.guide-blue`），自上而下三段：① **循环播放的演示动画** —— 素材已按 2026-09-29 需求补入（`GUIDE_VIDEOS.switch` = `assets/Switch To LoveCo Keyboard.mp4`，画面即「长按地球 → 在选择器里切到 LoveCo」那一段）：圆角白卡内嵌 `<video autoplay muted loop>`，**高度按视频比例自适应**（素材 1280×730 横版 —— 卡不撑满余高，在输入框以上的整块余高里**上下居中**，视频按原始宽高比完整显示不裁切放大；余高不够时 max-height 兜底防溢出），与引导页大卡同一套「静音起播、拿到手势开声音」的处理（见 wireGuideVideos）；**演示层（键盘使用引导）盖上来后本页整块被盖住 —— 视频会被暂停、也不再参与「开声音」**（2026-09-29 需求：否则后台一直漏视频声，见 coveredGuideVideos）；② **LoveCo 页面的输入框** —— 整宽 38px 高、圆角 10px、白底 + 1px 浅灰描边 + 一层淡投影，占位文案「输入消息…」，**进来就是激活态**（渲染后焦点直接交给它、光标在框里闪，不用先点一下；点页面上任何一处也会把焦点还回来，始终看着「正等着输入」）；③ **当前正在使用的键盘**（高 = `--lc-keyboard-height`，与真实键盘同高 —— 换键盘时页面不跳）：固定是**系统英文键盘**（这一页只演「切换前」那一刻，1:1 照设计图用 CSS 画：顶部候选词行 i / the / i\'m（白底 + 两条竖分隔线）→ qwerty 三排（白键 + 灰色 ⇧ / ⌫，第二排左右各内缩一截）→「123 / space / done」（done 是蓝底白字）→ 底行「地球 + 提示气泡 + 麦克风」）。地球**长按 350ms** 弹出**键盘选择器**（短按也给同一个出口，宽容处理 —— 真机上短按是切下一个键盘）；提示气泡是**对话气泡**（蓝紫底白字，文案 **「长按 🌐 切换到LoveCo键盘」**；圆角 12px + 左侧中间一枚三角形小尾巴指着地球，**静态不闪** —— 原来的呼吸动画已按需求去掉）。**键盘选择器**（设计截图 2）：白色圆角面板（宽 208px、圆角 14px、带整页半透明遮罩、从下往上弹出）贴在键盘底行上方左侧，自上而下「更多键盘设置…」/ 分隔线 / **LoveCo** / **英文键盘**（当前正在用的那套右侧打勾）；设计截图里的「中文9键」「中文手写」已按需求删除、只留 LoveCo，另补一行「英文键盘」（样式即第一张图的系统英文键盘）；面板底部按截图保留两枚装饰小图形（切换键盘 / 键盘设置，无动作）。点任意一行 = 在系统里把当前键盘切过去（落到 `permissions.ime`，与左栏「设备权限 › 当前输入法」同一个状态）：选 **LoveCo** = 第二步达成 —— **不就地换形态**（2026-09-29 需求：原来的「LoveCo 键盘预览 + 完成胶囊」形态已删除），接着走引导的后半段（**2026-10-08 需求把「键盘使用引导（演示）」挪到链路最后**：先补状态检查链后两环 —— 完全访问 → 登录，再走资料引导（性别 / 出生日期，新设备必走），最后才开演**「键盘使用引导（演示）」**，见 pickKbSwitch / guideAfterSwitch / kb-usage-guide），演示收场（Esc / 「去使用」）= 引导完成（落首页 + 等 1 秒弹会员购买页，见 closeKbUsageGuide / finishGuide）。选**英文键盘**（或本就在系统键盘上）即留在本页。「更多键盘设置…」= 去模拟系统设置页（按运行平台那一版，见 appKbGuideScreen），从那儿按返回箭头退回时回到本页。',note:'**iOS / 鸿蒙共用同一套渲染**（2026-09-28 需求「该页面 iOS、鸿蒙共用」）—— iOS 与鸿蒙只差状态栏（药丸 / 圆点挖孔）；安卓的第二步是键盘切换悬浮窗（kb-guide-ime-switch），不走这一页。引导完成判定三端统一：**键盘已启用 + 当前键盘已切到 LoveCo**（`guideSatisfied`）—— 此前 iOS / 鸿蒙「系统侧启用即完成」的判定已作废，这两个端的收尾动作是「第二步选完 LoveCo 后依次走完 完全访问 → 登录 → 资料引导 → 键盘使用引导（演示），演示收场才算完成、落首页」（2026-09-29 需求：原页内「完成」胶囊已删；**2026-10-08 需求把演示挪到链路最后**，见 guideAfterSwitch；安卓在悬浮窗里选完 LoveCo 走同一条链路）。输入框与键盘都是**只读演示**：系统英文键盘的键位是纯外观（不接输入法逻辑），只有地球可点（弹键盘选择器）。演示视频素材 2026-09-29 补入（「素材待补」占位卡随之删除）。'},
    {id:'kb-guide-settings',group:'模拟系统设置',name:'系统-键盘设置(鸿蒙)',route:'引导页 ›「启用LoveCo输入法」（模拟系统设置）',trigger:'鸿蒙引导页点「启用LoveCo输入法」；本列表点入',desc:'模拟鸿蒙系统「输入法」设置页的**深色整页**（2026-09-28 改名「系统-键盘设置(鸿蒙)」，与 iOS / 安卓版分家 —— iOS 是另一套结构、另有一条 kb-guide-settings-ios，安卓另有一版小米风格浅色「设置」页 kb-guide-settings-android，本页只服务鸿蒙引导）：顶部圆形返回钮 + 大标题「输入法」；「输入法管理」灰色小标题；第一张深色卡片「默认输入法 | 小艺输入法 ▾」——**这一行可点**（LoveCo 已启用后点它在「小艺输入法」与「LoveCo」之间来回切，见 switchGuideIme —— 这是「切换当前输入法」在鸿蒙这一版的落点（**安卓**那版不存在这一步 —— 切换当前输入法的落点是**键盘切换悬浮窗**，见 kb-guide-ime-switch）；LoveCo 还没启用时整行不可点、压暗 —— 真实系统里未启用的输入法也选不了），右侧值随当前输入法变化；第二张卡片是输入法列表 —— **小艺输入法**（蓝色勾选圈 + 折角箭头，已启用）与 **LoveCo**（空心圈，右侧「未启用 ›」，启用后改「已启用」）。设计稿里其它几个第三方输入法按需求不渲染（除小艺外全部删掉，只留 LoveCo）。**左下角悬浮窗**（画中画）：同一支演示视频缩成小窗**只播一次、不循环**（2026-09-28 需求，播完停在末帧；**带声音**，与引导页大卡同一套处理，见 wireGuideVideos），「启用LoveCo」打开后浮现绿色对勾与「完成后返回LoveCo App」小字 —— 点它（或从系统设置「回到 App」：设置页左上角的返回箭头，两处同一套校验）＝ 从系统设置**返回 LoveCo App**：重新校验（键盘已启用**且**当前键盘已切成 LoveCo，见 guideSatisfied），都通过就关闭引导页（接着走引导后半段 —— 完全访问权限 → 登录状态 → 资料引导 → 「键盘使用引导（演示）」，演示收场才落首页 + 等 1 秒弹会员购买页，**2026-10-08 需求把演示挪到链路最后**，见 guideAfterSwitch；没过就停在对应引导层上）；只启用了键盘、还没切键盘就落到**第二步整页「切换到 LoveCo 键盘」**（2026-09-28 起 —— 鸿蒙 / iOS 共用那一页，长按地球把键盘切过来后走同一段后半链；2026-09-29 改，原「完成」胶囊已删，见 kb-guide-switch）。点 LoveCo 行进它的详情页（鸿蒙 / 安卓共用这一条落点）',note:'返回箭头只是系统设置内的逐级导航（详情 → 设置 → 引导页），**不完成引导、也不弹任何层**（2026-09-28 需求：主 App 感知不到系统设置里的变化）—— 键盘启用后由设置页左上角返回箭头 / 悬浮窗收尾 —— 回到 App 那一刻才校验（第二步落在「切换到 LoveCo 键盘」整页上）；「默认输入法」行的切换本身同样不结束引导（选成 LoveCo 后回到 App 就直接完成引导，不再经第二步页）'},
    {id:'kb-guide-detail',group:'模拟系统设置',name:'系统-键盘权限 (鸿蒙)',route:'模拟设置 › LoveCo 行（模拟系统设置）',trigger:'模拟鸿蒙设置页点「LoveCo」行；本列表点入（切到鸿蒙）',desc:'LoveCo 输入法在系统设置里的详情页（深色整页；**这一版只服务鸿蒙 / 安卓引导** —— iOS 有自己的一版，见 kb-guide-detail-ios，两版的页名与第二颗开关名不同）：顶部圆形返回钮 + 大标题「LoveCo」，下方一张深色卡片放两个开关行 —— ①「启用LoveCo」：**默认关**，蓝色鸿蒙样式开关，打开即键盘启用（与左栏「开启键盘」是同一个开关 permissions.kbEnabled）—— **只改设备状态**（2026-09-28 需求）：这一页是模拟的系统页面，主 App 感知不到权限变化，开关打开 **不弹完全访问引导层、也不完成引导**，只在本页就地生效（第二个开关显现、悬浮窗浮出对勾）；②「完整体验模式」：**第一个开关打开之后才显现**（默认关，显现带淡入）—— 鸿蒙系统里「完整体验模式」就是**完全访问这个权限的名字**（iOS 那版同一颗开关叫「允许完全访问」，见 kb-guide-detail-ios），所以它直接绑 `permissions.keyboard`：**与左栏「设备权限 › 键盘完全访问」是同一个开关**，开 / 关两处同步（2026-09-28 需求；此前另存在 kbGuideFull 里、左栏那颗开关不跟着动），**关掉第一个开关时它随行一起收回、权限复位成关**（2026-09-28 修复），也仍是**只改设备状态**（不弹完全访问引导层、不完成引导）。左下角同一颗视频悬浮窗：启用后浮现绿色对勾与「完成后返回LoveCo App」，点它（或从系统设置「回到 App」：设置页左上角的返回箭头，两处同一套校验）＝ 返回 LoveCo App 并重新校验权限（键盘已启用**且**当前键盘已切成 LoveCo）—— 通过就关闭引导页（完成引导，回主 App 首页 —— 首页前还会接着跑状态检查链的后两环：完全访问权限 → 登录状态，没过就停在对应引导层上；在详情页把「完整体验模式」打开后再返回，完全访问这一环就已是开的）；键盘已启用但还没切键盘则落到**第二步整页「切换到 LoveCo 键盘」**（2026-09-28 起，见 kb-guide-switch）；详情页的返回箭头逐级退回模拟设置页（纯导航、不触发校验），**设置页左上角那枚返回箭头才是「回到 App」**（那一刻重新校验：条件齐了当场完成引导，见 guideBack）',note:'「启用LoveCo」关掉即回到未启用态（第二个开关随之隐藏、悬浮窗对勾消失），同时把「当前输入法」复位成系统默认（未启用的键盘不可能当当前输入法）、**完全访问（permissions.keyboard）也一并复位成关** —— 完全访问是键盘的权限，键盘没启用就不该开着，左栏「设备权限 › 键盘完全访问」同步变关（2026-09-28 修复；左栏那颗「开启键盘」同一套联动，见 toggleGuideEnable）；返回箭头回模拟设置页（鸿蒙那一版）；「App 回前台」的出口是悬浮窗 / 退回设置页后点左上角返回箭头（同一套校验，见 guidePipBack / guideBack）'},
    {id:'kb-guide-detail-ios',group:'模拟系统设置',name:'系统-键盘权限 (ios)',route:'模拟 iOS 设置页 ›「键盘」行（模拟系统设置）',trigger:'模拟 iOS 设置页点「键盘」行；本列表点入（切到 iOS）',desc:'LoveCo 键盘在 iOS 系统设置里的权限页（深色整页，2026-09-28 按设计图补入；与鸿蒙那一版（`kb-guide-detail`）是**同一件事的两套外观**）：顶部导航条 —— 左侧蓝色「‹ LoveCo 键盘」（那五个字是**上一页的页名**，回 iOS 设置页、纯导航不完成引导）＋ 居中标题「**键盘**」；导航条下方（间隔 26px）一张圆角卡片两行 —— ①「**LoveCo 键盘**」＋**绿色 iOS 开关**（50×30 绿底白钮，关着时深灰底）＝ 键盘启用，与左栏「开启键盘」同一个开关 `permissions.kbEnabled`：**默认关**，打开即键盘启用，**只改设备状态**（这一页是模拟的系统页面，主 App 感知不到权限变化 —— 不弹完全访问引导层、也不完成引导，只在本页就地生效：第二行显现、悬浮窗浮出对勾）；② 一枚键盘图形（灰底白键盘，同设置页那排小图标）＋「**允许完全访问**」＋同款开关 ＝ 完全访问权限，与左栏「设备权限 › 键盘完全访问」同一个开关 `permissions.keyboard`（开 / 关两处同步）；**iOS 系统里这颗权限就叫「允许完全访问」**（鸿蒙那版叫「完整体验模式」），它**只在第一颗开关打开后显现**（默认关），且随第一颗开关**一起收回并复位成关**（2026-09-28 修复：完全访问是键盘的权限，关掉「LoveCo 键盘」后左栏「键盘完全访问」同步变关，重开键盘时它以关的状态重新显现）；卡内的分隔线在这版里只缩进 16px（与卡片内容左间距齐，见设计图 —— 设置页那几张是缩到图标右侧的 57px）。左下角同一颗视频悬浮窗：启用后浮现绿色对勾与「完成后返回LoveCo App」，点它（或从系统设置「回到 App」：设置页左上角的返回箭头，两处同一套校验）＝ 返回 LoveCo App 并重新校验权限（见 guidePipBack / guideBack）—— 通过就关闭引导页（完成引导，回主 App 首页 —— 首页前还会接着跑状态检查链的后两环：完全访问 → 登录，没过就停在对应引导层上）；本页的返回箭头退回 iOS 设置页（纯导航、不触发校验），设置页那枚返回箭头才是「回到 App」（这一刻重新校验）',note:'iOS 那页与鸿蒙页的差异：页名（导航条「‹ LoveCo 键盘 / 键盘」对「返回钮 + 大标题 LoveCo」）、第二颗开关名（允许完全访问 / 完整体验模式）与开关配色（绿 50×30 / 蓝 46×26）；两版共用同一套状态与判定（permissions.kbEnabled / permissions.keyboard、只改设备状态、返回纯导航），页内交互动作也同一批（kb-guide-enable / kb-guide-full / kb-guide-back / kb-guide-pip）；两版的第一颗开关关掉时第二颗（完全访问）也**一并复位成关**（2026-09-28 修复：此前关了键盘开关、左栏「键盘完全访问」仍是开的），重开键盘时第二颗以关的状态重新显现'},
    {id:'kb-guide-settings-ios',group:'模拟系统设置',name:'系统-键盘设置(ios)',route:'引导页（?platform=ios）›「启用LoveCo输入法」（模拟系统设置）',trigger:'iOS 引导页点「启用LoveCo输入法」；本列表点入（切到 iOS）',desc:'模拟 iOS 设置里**按 App 分组的「LoveCo 键盘」页**（深色整页，2026-09-28 按设计图补入）：顶部一条导航条 —— 左侧蓝色「‹ App」返回（回引导页；纯导航、不完成引导），居中标题「LoveCo 键盘」；正文两组圆角卡片（#1C1C1E、行高约 44px、分隔线自图标右侧起）：① **允许“LoveCo 键盘”访问** —— 照片（白底彩色风车图标，右侧值「私密访问」）/ Siri（深底彩色光球）/ 搜索（灰底白放大镜）/ 通知（红底白铃铛，副标题「关」）/ 无线数据（绿底白信号弧，副标题「无线局域网与蜂窝网络」）/ **键盘**（灰底白键盘图形）六行，其中**只有「键盘」行可点** —— 点它进 **iOS 版键盘权限页**（`kb-guide-detail-ios`：两行开关 ——「LoveCo 键盘」+「允许完全访问」，与鸿蒙那条链路的落点对应）；页脚说明也正是让人去点「键盘」；② **首选语言** —— 语言（蓝底白地球）|「简体中文」。卡下压一段灰色页脚说明（「LoveCo 键盘」设置 / ⭐️ 如果此页面没有显示「键盘」/ ❶ 上滑关闭设置应用后，再重新打开设置进入这个界面 / ❷ 进入后，点击「键盘」，打开「LoveCo」和「允许完全访问开关」/ 由于系统限制，未打开允许完全访问时，键盘部分功能将受到影响 / 🚫 开启完全访问权限仅用于键盘请求输出内容 / 我们严格遵循《隐私协议》，不会收集您的个人信息）。**按需求不渲染设计图里的「从其他 App 粘贴」分组**（连同那张「… | 询问 ›」卡片一并删掉）；设计图里的 lovekey 字样一律改 LoveCo。**左下角同一颗视频悬浮窗**（画中画，iOS 下播 iOS 素材）：键盘启用后浮出绿勾与「完成后返回LoveCo App」，点它（或从系统设置「回到 App」：设置页左上角的返回箭头，两处同一套校验）＝ 从系统设置**返回 LoveCo App** 并重新校验（键盘已启用**且**当前键盘已切成 LoveCo，见 guideSatisfied），通过就关闭引导页、完成引导回首页；键盘已启用但还没切键盘则落到**第二步整页「切换到 LoveCo 键盘」**（2026-09-28 起 —— iOS / 鸿蒙共用那一页，长按地球把键盘切过来再点「完成」，见 kb-guide-switch），即「‹ App」返回键在键盘开好之后的那一下也是这一步的入口',note:'iOS 的键盘设置页与鸿蒙不是同一套结构（iOS 按 App 分组、没有「输入法管理」列表），所以按端分叉渲染 —— 本页只在 iOS 平台出现（appKbGuideScreen 里按 state.platform 选页，鸿蒙走 kb-guide-settings、安卓走 kb-guide-settings-android）；详情页已按设计图补入 iOS 版（kb-guide-detail-ios）'},
    {id:'kb-guide-settings-android',group:'模拟系统设置',name:'系统-键盘设置(安卓)',route:'引导页（?platform=android）›「第一步 启用LoveCo输入法」（模拟系统设置）',trigger:'安卓引导页点「第一步 启用LoveCo输入法」；本列表点入（切到 Android）',desc:'模拟安卓（小米 HyperOS 风格）系统「设置 › 输入法」页的**浅色整页**（2026-09-28 按设计截图补入，与鸿蒙 / iOS 两版结构都不同；只服务安卓引导）：浅灰底（#F2F2F6，状态栏连着一起转浅色）+ 白色圆角卡片 + 两段灰色分组标题，顶部左上返回箭头（回引导页，纯导航、不完成引导 —— **退回引导页那一刻才按键盘状态切到第二步**：键盘已启用就收起演示卡与卡下说明（第二步不放演示视频）、并弹出键盘切换悬浮窗，见 kb-guide-android / kb-guide-ime-switch）+ 下方大号加粗标题「设置」。分组 ①「**官方输入法**」：只留一行**讯飞输入法**（副标题「中文（中国）」、行首蓝色圆形 iFLY 标、右侧开关开着）—— 设计截图里的「搜狗输入法小米版」按需求删除、原「小米定制版输入法」分组改名「官方输入法」而来；这一行是静态展示，开关不参与任何状态。分组 ②「**其他输入法**」：只放一行 **LoveCo 输入法**（副标题「中文（中国）」、行首一枚 LoveCo 图标 `assets/brand/LoveCo_128_128.png`、右侧开关**默认关闭**）—— 截图里 LoveCo / Lovekey键盘 / 灵焰恋爱大师 / ToDesk 四行全部删除后只留这一行。这颗开关就是 `permissions.kbEnabled`（与左栏「设备权限 › 开启键盘」、详情页「启用LoveCo」是同一个开关）：打开即键盘启用、关掉即停用（当前输入法随之复位成系统默认、完全访问一并复位）—— **安卓没有「键盘完全访问」这个权限**（系统侧默认就给到），打开键盘时 `permissions.keyboard` 一并置开（见 syncFullAccess）。**本页不启动视频悬浮窗**（2026-09-28 需求）：出口只有顶部那枚返回箭头（离开系统设置 = 回到 App：键盘已启用就换第二步、并自动弹出键盘切换悬浮窗，见 guideBack）；「切换到 LoveCo 输入法」（引导第二步）的落点也不在这一页（是退回引导页后自动弹出的**键盘切换悬浮窗**，见 kb-guide-ime-switch）—— 本页只负责「启用」',note:'三端设置页现已分家：鸿蒙 = 深色「输入法」页（appGuideSettings）、iOS = 深色「LoveCo 键盘」页（appGuideSettingsIos）、安卓 = 本页浅色「设置」页（appGuideSettingsAndroid，appKbGuideScreen 里按 state.platform 选页）；整页皮肤连着状态栏一起换浅色（renderApp 挂 .guide-light，样式见 theme.css 的 .mi-* 一组）。安卓下一步（切换到 LoveCo 输入法）的落点是键盘切换悬浮窗（kb-guide-ime-switch）—— 从本页返回引导页时按键盘状态自动弹出'},
    {id:'kb-guide-ime-switch',group:'模拟系统设置',name:'键盘切换悬浮窗(安卓)',route:'安卓引导页 ›「第二步 切换到LoveCo输入法」；从「系统-键盘设置(安卓)」退回引导页时自动弹出（模拟系统输入法选择器）',trigger:'① 安卓引导页点「第二步 切换到LoveCo输入法」；② 从「系统-键盘设置(安卓)」按返回箭头退回引导页、且键盘已启用、当前输入法还不是 LoveCo（自动弹出，2026-09-28 需求）；本列表点入（切到 Android，摆成第二步那一刻：键盘已启用 + 当前输入法系统默认 + 悬浮窗开着）',desc:'仿真安卓系统「点键盘上的切换输入法按钮」弹出的**输入法选择器**（2026-09-28 按设计截图补入）：屏幕底部一张白色抽屉（圆角顶、浅紫选中行、带一层半透明遮罩，见 theme.css 的 .ie-* 一组），自上而下：**顶部一行提示「选择 LoveCo 输入法」**（2026-09-28 需求：引导第二步不再放演示视频卡与卡下说明，这句指路话挪进这一层的弹框里，见 kb-guide-android）+ 按输入法分组 —— 灰字组名 + 该输入法的语言行：①「**LoveCo**」→ 一行「中文（中国）」；②「**讯飞输入法**」→ 一行「中文（中国）」；**只列这两个输入法**（设计截图里第三组「👉 Lovekey键盘」按需求去掉），当前输入法（`permissions.ime`）那一行铺淡紫底 + 右侧深色对勾（截图里选中的正是 LoveCo）。点任一行 = 在系统里把当前输入法切过去（选 LoveCo 即 `permissions.ime=loveco`）、**本层随即收起**；点抽屉外的遮罩收起本层、不改任何状态。收起本层 = 回到 App：选完 LoveCo（引导第二步达成）**不落首页**，接着走引导的后半段（2026-10-08 需求把演示挪到链路最后：先补状态检查链后两环（安卓只剩登录）→ 资料引导（性别 / 出生日期）→ 最后才**进「键盘使用引导（演示）」**、整机演示层从头开演，**演示收场（「去使用」/ Esc）才算引导完成**、落首页 + 等 1 秒弹会员购买页，见 pickGuideIme / guideAfterSwitch / openKbUsageGuide / closeKbUsageGuide）；选回系统默认则留在引导页继续',note:'只有安卓引导流程会开它（`state.kbImeSwitch`）；鸿蒙 / iOS 没有这一层（鸿蒙在模拟设置页的「默认输入法」行里切，见 kb-guide-settings）—— 安卓系统不允许 App 直接切输入法，所以第二步的手感就是「用户在系统选择器里自己选」。真机上的选择器还列其它系统输入法，这里按需求只留 LoveCo 与讯飞输入法两个'},
    /* 首次登录后的「资料引导」两条（2026-09-28 需求）：第一次登录成功收起登录层那一刻接这两页 ——
       「选择性别」**不可跳过**、「你的出生日期」**可跳过**；两步各占一条便于静态对照 */
    {id:'onboard-gender',group:'资料引导',name:'资料设置 · 选择性别(首次登录)',route:'首次登录成功 › 第一步',trigger:'**性别还没设置时登录成功**（一键登录 / 短信登录）收起登录层那一刻自动进入（左栏「模拟 › 已设置性别」开关**关着**才算没设置，默认关、走完自动置成开；首启引导期间无条件进；左栏「模拟 › 登录状态」开关置成开同样进）；或本列表点入（现场摆成「已登录 + 性别还没设置」的第一步，不落库）',desc:'**主 App 的整页**（无底部 Tab 栏，状态栏连着一起转淡紫 `.guide-lavender`）：淡紫底（#F5F6FC）、元素**整体上下居中**，自上而下 —— ① 顶部一行**三个分页圆点**（当前这一步深色 #2E2E3A、其余浅灰 #D9DBE6 —— 设计图是三步的资料页，目前只做前两步）；② 大标题「**选择性别**」（21px / 700）；③ 两张**并列的白色圆角卡**（1:1、圆角 26px、白底 + 一层淡投影、间距 18px），卡里各摆一个**性别符号图形**（按需求用 ♂ / ♀ 代替原来的插画头像：粗圆头描边 7.5 + 渐变描边色 —— 男 ♂ 蓝紫渐变 #7C8CFF→#4B57E6、女 ♀ 粉红渐变 #FFA8C4→#F4558C；♂ = 圆 + 指向右上（↗）的箭头，♀ = 圆 + 下方十字），卡下各自一行 16px 标签「男」/「女」—— 选中那张铺浅紫底 + 蓝紫描边、标签转品牌色；④ 底部**蓝色胶囊箭头按钮**（88×44、圆角 22、#5B68F5 + 白色右箭头 —— 尺寸 2026-10-04 按需求收小一档，原 112×56）—— **没选性别时置灰、不可点**（这一步没有「跳过」，也不留出口）。点卡片即选中（写 `state.gender`，与「用户」页的性别是同一个值），箭头点亮后点它进第二步「你的出生日期」',note:'首次登录资料引导的第一步（见 finishKbLogin / startOnboarding）：**不可跳过** —— 页面上没有「跳过」那颗按钮，底部箭头在选中之前一直置灰；这一步只改 `state.gender`（不落库），走完第二步的箭头才与生日一起落库（见 finishOnboarding）。它是主 App 的页面 —— 从键盘形态登录进来也会切到主 App 走完再回；走完第二步后的落点看这次登录的上下文：普通登录回首页 + 排自动付费墙，**引导链路（切完键盘 → 登录 → 资料引导）里则接着开演「键盘使用引导（演示）」**（2026-10-08 需求，见 finishOnboarding / guideAfterSwitch）'},
    {id:'onboard-birthday',group:'资料引导',name:'资料设置 · 你的出生日期(首次登录)',route:'首次登录成功 › 第二步',trigger:'性别那一步选好点底部箭头进入；或本列表点入（现场摆成「已登录 + 性别已选」的第二步，滚轮默认停在 2006年9月28日，不落库）',desc:'**与第一步同一套整页皮肤**（淡紫底、居中、三个分页圆点这回亮第 2 个），自上而下 —— ① 顶栏三件事：左侧**白色圆形返回钮**（36px + 淡投影，回第一步「选择性别」，选过的性别留着）、中间分页圆点、右侧**「跳过」**（灰字 15px —— 这一步**可跳过**：点了不带生日结束引导）；② **蛋糕插画**（116px，照设计图：粉色托盘 + 两层蓝蛋糕 + 奶油波浪 + 一根点着的蜡烛）；③ 大标题「**你的出生日期**」；④ **三列滚轮**（年 1980–2015 / 月 1–12 / 日 1–31，行高 44px、整块高 220px，CSS scroll-snap 吸附到中线那一行，中线上铺一条白色圆角选中带、选中行深色加粗，滚 / 点某一行即停到那行）；⑤ 滚轮下一行**「N岁  星座」**（17px / 600，两项间隔 26px，按停着的那天实时算 —— 年龄按今天、星座按 12 段月日划分，设计图 2006-09-28 = **20岁 天秤座**；日按当月天数收紧，2 月 30 日按当月最后一天算）；⑥ 底部同一颗**蓝色胶囊箭头按钮**（88×44，与第一步同尺寸，这一步常亮）：点它把那天写成 `state.birthday`（`YYYY-MM-DD`）并结束引导。滚轮改动**不整页重渲染**（重建 DOM 会把滚轮位置弹回），只就地刷新「N岁 星座」这一行（见 bindWheelCols）',note:'首次登录资料引导的第二步（**可跳过**）：跳过 = 不带生日结束引导（性别已在第一步选好），返回箭头只是回第一步、不算跳过。生日与「用户」页的出生日期行是同一个值（`state.birthday`）；落库时顺带把 age 对上 18–22 / 23–30 / 31–40 / 40以上 里那一档（该字段自「用户」页改版后不再显示、只留在存档里）；两步走完（或跳过第二步）把「模拟 › 已设置性别」开关自动置成开（`state.genderSet=true`，落库）、**落点看这次登录的上下文**：普通登录进主 App 首页（+ 排自动付费墙）；**引导链路（guideDemoPending）里接着开演「键盘使用引导（演示）」**（2026-10-08 需求把演示挪到链路最后：切完键盘 → 登录 → 资料引导 → 演示 → 首页 + 等 1 秒弹会员购买页）—— 之后登录不再出现这两页；想再看一遍把开关关掉即可。首启引导期间无条件进这两页，且性别那一步不可跳过 —— 在性别页上退出 App 时开关仍关着，下次登录会再检查一次性别'},
    /* 键盘使用引导（kb-usage-guide 组件）：整机覆盖的**纯演示层**（假页面）——
       不接真实链路，只把「截图 → 唤出键盘 → AI 分析 → 选回复 → 发送」从头演一遍。
       聊天页与键盘都是自绘的，主 App 与键盘两种形态的整机都挂这一层（点入不切 App形态，
       主 App 列表点入就地铺在主 App 整机上）。
       2026-09-29 起它也是 iOS / 鸿蒙「开启键盘」引导第二步的落点（「切换到 LoveCo 键盘」
       页里选完 LoveCo 即开演，那一次收场 = 完成引导，见 pickKbSwitch / closeKbUsageGuide）；
       从页面列表直接点入时不带这个上下文，收场只回原页。 */
    {id:'kb-usage-guide',group:'演示',name:'键盘使用引导（演示）',route:'主 App / 键盘 › 整机覆盖层（贯穿全屏的演示流程，两形态通用）',trigger:'本列表点入（**不切 App形态**，演示层就地铺在主 App 整机上 —— 现场摆成引导第一步：干净的聊天页，亮相半秒后遮罩淡入压暗、高亮「模拟截屏」按钮并浮出开场说明卡「如何使用 LoveCo ？」）；**也是引导链路的最后一站**（**2026-10-08 需求：从「第二步选完 LoveCo 即开演」挪到链路最后** —— 切完键盘（iOS / 鸿蒙在「切换到 LoveCo 键盘」页选完、安卓在键盘切换悬浮窗选完）先依次走 完全访问 → 登录 → 资料引导（性别 / 出生日期，新设备必走），都走完才开演，见 pickKbSwitch / pickGuideIme / guideAfterSwitch / guideToDemo）—— 这一路收场（「去使用」/ Esc）= 完成引导、落首页 + 等 1 秒弹会员购买页（见 closeKbUsageGuide）；本列表点入不带这个上下文，收场只回原页',desc:'**纯演示的假页面**：不接真实链路 —— 没有截图进相册、没有 AI 请求，也不动积分与会话消息，只在整机覆盖层里把「截图分析一条龙」从头演到尾（每一步只有高亮区域可点、点别处无反应；Esc 随时收场；演示层开着时从页面列表点入**其它**条目也会被顺手收掉 —— 2026-09-29 需求，不再让它盖在刚点入的页面上）。十步：① 仿微信聊天页（林间、深色，**只留**对方那句「爸爸说，离花言巧语的男生要远一点。」，上面不留历史记录）—— 页面先干净亮相半秒，随后遮罩淡入压暗，**高亮「模拟截屏」按钮本身**（self 模式：提示**水平**按消息行居中、**竖直**落在开场说明卡正下方 20px（2026-10-08 需求），高亮框贴提示块自身（左右另加跳动外扩的余量，放大到峰值时四边间隙一致 —— 2026-10-08 需求）；**无手势 emoji**，2026-09-29 需求删掉手指），**同时屏幕正中浮出开场说明卡**（`.gx-intro`：深色玻璃卡 + 蓝色星标徽标 + 「如何使用 LoveCo ？」标题 + 「当对方发送了一条不知怎么回答的消息时，先截屏！」、末句填成与「模拟截屏」提示块**同一支蓝色渐变**做重点；卡**竖着居中在屏幕正中**（2026-10-08 需求：原先沉在聊天区下半部、贴输入栏上方）、比遮罩再晚半拍浮起，自己不接点击 —— 2026-09-29 需求补：进来先让用户知道这页是干嘛的）—— 点按钮（或高亮区）推进；② 点掉后**遮罩瞬间消失**、整屏白闪一下 + 左下角先弹出一张**大的截图卡再缩成「刚截的截图」小缩略图**（卡里就是真机截图资产 assets/guide-chat-shot.png（2026-10-06 晚些聊天页对方头像换成系统内置女生头像后按「维护说明」重截过，菜单栏那颗缩略图 guide-chat-thumb.png 同批重截）；iOS 截屏动画的样子，停约半拍自动滑走，滑走后正好进下一步）；③ 遮罩出现，改高亮宿主**输入框**（2026-10-08 需求：此前高亮整行输入栏 —— 输入栏横贯全宽、贴屏幕底边，框加 pad 后左右与底部三条边全在屏外、只看得见顶部一条线，改框住输入框本身），提示「点击输入框，唤出键盘」；④ 键盘从屏幕底部弹上来（高度 0 → 常规键盘高，聊天区随之压缩）；⑤ 遮罩再回来，高亮菜单栏里那张**刚截的缩略图**（相册图标就地换成截图缩略图、持续跳动），提示「点这里，AI 帮你分析」放在缩略图的**左侧**、手指朝右指着它，提示块左右浮动（2026-10-08 需求：这颗提示的浮动方向由上下改成左右 —— 朝缩略图一侧往复、跟手指的指向合拍，见 theme.css 的 gx-tip-slide）；⑥ 分析面板**从底部滑入一次**，内容区先是约 0.56 秒的「正在分析中…」取景框扫描动画；⑦ 同一块面板换成结果，打字机逐字输出：关系简报（「关系阶段：熟悉 / 聊天氛围：相互拉扯试探」+ 一段分析正文）→ 两条回复思路卡（标题 + 回复正文，只演这两条）；⑧ 输出完面板底部浮出悬浮按钮条（麦克风 / 重新生成 / 发送），遮罩高亮第一条回复（整卡）提示「就用这句」；⑨ 点选后整卡亮起、**面板不收起**，遮罩改高亮面板底部那颗「发送」提示「发送给 TA」（face 模式：整块提示左移，朝下的手势正好落在发送按钮的中轴线上，2026-09-29 需求）；⑩ 点发送 → 回复进会话（我的绿色气泡入场）+ 庆祝层「**Nice～**」（彩带飘落 + 蓝色胶囊「去使用」；庆祝层下菜单栏相册位置**换回普通的图片图标** —— 不再是跳动的截图缩略图，2026-09-29 需求）→ 点它收场并跳主 App 首页。**设计**：遮罩是半透明黑（rgba(0,0,0,.62)），高亮区用「聚光灯」做法（高亮框的 box-shadow 铺满全屏，框内透出下层内容），框缘一圈呼吸描边；高亮框的位置**不写死在 CSS 里** —— 渲染后由 JS 实测目标元素（消息行 / 输入框 / 缩略图 / 回复卡 / 发送按钮）贴合，屏幕高度、键盘状态变了也不会错位；提示块跟着目标自动落在它的上方或下方（手指 emoji 换向、始终在文字**右端**；第一步不带手势、只有文字），也可贴到目标左侧、手指朝右（缩略图那一步）；**第一步是例外**：提示块不跟目标走，落在屏幕正中的开场说明卡**正下方**（2026-10-08 需求，与卡片读成一叠）。聊天页与键盘都是**自绘**的（聊天复用宿主会话的 .wx-* 骨架与皮肤，键盘外壳借 .keyboard 的骨架、键区与底栏直接复用真键盘组件 kb-keys / kb-navbar），不读底层手机当前停在哪个页面；「刚截的截图」用的是**真机截图资产**（2026-09-29 需求，此前是自绘的「聊天页缩影」色块骨架）：浮出的大图 assets/guide-chat-shot.png（618×1352，第一步那个仿微信聊天页的全屏截图）、菜单栏那颗方形小图 assets/guide-chat-thumb.png（同一张裁出的 618×618 方形版，含林间标题 + 日期 + 女生那句）。分析面板**从扫描那一步起一直在屏** —— 只换内容、不重播弹入动画（此前每步都重建 DOM，看着像弹了两次）。步骤之间的过渡都是动画：白闪 .42s + 缩略图浮出 .9s、键盘弹起 / 回落 .34s、面板滑入 .2s（仅一次）、打字机每帧 2 字 / 22ms（全篇约 1 秒）—— 2026-09-29 两次提速（每次快 1/3）：分析过场（面板滑入 + 骨架扫描线）+ 打字机。',note:'演示性质，不进真实用户链路（入口：本列表，以及引导链路的最后一站 —— 2026-10-08 需求起它在 登录 → 资料引导 之后开演，见 guideAfterSwitch）；推进动作 gx-next:<步> 会校验当前步 —— 连点、旧 DOM 的点击推进不了；中途 Esc 直接收场回主 App 原页（本条目在主 App 形态点入，收场不切形态）。结束时跳主 App 首页（openAppScreen("home")）—— 首页当前是空白模板，落地即见底部 Tab 栏。本条目点入 = 从第一步开始，每一步点击照常推进（可以整条走完）；剧本（聊天记录 / 分析结果）在 app.js 的 GUIDE_DEMO，改文案只改那一处'},
  ];
  function pageCatalog() { return state.appView==='app' ? APP_PAGES : KB_PAGES; }
  /* 页面列表：按组分节，组名可点击折叠 / 展开。
     默认全部折叠：state.pageExpanded 是「展开的组」集合（空 = 全折叠），点组名才加入 / 移除。
     折叠只藏条目，不影响手机当前页面与详情区 —— 详情跟着 docPage 走。 */
  function pageList() {
    const catalog=pageCatalog();
    let group='', html='';
    for(const it of catalog){
      if(it.group && it.group!==group){
        group=it.group;
        const expanded=!!state.pageExpanded[group];
        const count=catalog.filter(x=>x.group===group).length;
        html+=`<button class="page-group${expanded?'':' collapsed'}" data-action="page-group-toggle:${group}" aria-expanded="${expanded}"><span>${esc(group)}</span><span class="page-group-count">${count}</span><i class="chev" aria-hidden="true">${icon('ArrowRight')}</i></button>`;
      }
      /* 折叠组：组头保留，条目全部跳过 */
      if(it.group && !state.pageExpanded[it.group])continue;
      html+=`<button class="page-item${state.docPage===it.id?' active':''}" data-action="page-doc:${it.id}" aria-pressed="${state.docPage===it.id}"><span>${esc(it.name)}</span></button>`;
    }
    return html;
  }
  function pageDetail() {
    const it = pageCatalog().find(x=>x.id===state.docPage);
    if(!it)return '';
    return `<div class="page-detail" id="page-detail"><div class="page-detail-head"><span class="status-tag">页面详情</span><strong>${esc(it.name)}</strong></div><div class="kv"><span>页面路径</span><strong>${esc(it.route)}</strong></div><div class="kv"><span>触发方式</span><strong>${esc(it.trigger)}</strong></div><div class="kv"><span>页面功能与设计</span><strong>${esc(it.desc)}</strong></div>${it.note?`<div class="page-detail-note">备注：${esc(it.note)}</div>`:''}</div>`;
  }
  /* 键盘形态页面跳转前的清场：关掉全部覆盖层 / 面板 / 弹层与打字态，回到
     「宿主会话 + 干净键盘」的底座，各页面 setup 再在此之上设置自己的状态。
     关闭对象编辑面板这一步走 dismissKbEditor —— 先兜底落库再收起；
     宿主输入框草稿（state.host）不清 —— 跳转页面不应动用户输入。
     清场同时把键盘拉回常驻（kbCollapsed=false）：底座就是「键盘在屏」的形态，
     从页面列表点进任何一个键盘页面都不该停在收起态（否则那页根本看不见）。
     单纯收起键盘走 collapseKeyboard() —— 它先 kbReset() 再置回 true。 */
  function kbReset() {
    abortVoiceHold();
    dismissKbEditor();
    state.modal=null;state.modalData={};
    state.partnerPanel=false;state.settingsPanel=false;state.photoPanel=false;state.photoBack='';
    state.partnersEmptyDemo=false;
    dismissChatPanel();
    /* 问AI 页（kb-free-chat）也是键盘底座上的一层：跳页面 / 收起键盘时一并收起
       （提问输入框的内容留在 state.freeText 里，下次进来还在） */
    dismissFreeChat();
    state.typing=false;state.composition='';state.t9Path=0;state.layer='letters';
    state.results=[];
    /* 键盘内登录层（连着压在它上面的协议正文页 kb-legal）也是「键盘侧的一层」：收起键盘 / 跳页面 /
       切形态时一并收起（走 closeKbLogin —— 连同「登录成功」的收起定时器一起摘掉；表单草稿留着，
       下次唤起键盘再按登录状态决定是否重新弹出）；
       完全访问引导层同理（下次唤起键盘时按权限重新检查） */
    closeKbLogin();state.kbLoginCode='';state.kbLoginSent=false;state.kbLoginBusy=false;
    closeKbFullAccess();
    /* 键盘内付费引导（kb-paywall）同样是「键盘侧的一层」：跳页面 / 收起键盘时一并收起
       （额度仍是 0 —— 再发起生成会按 state.creditsOut 重新弹）；
       iOS 系统支付框挂在它底下（closeKbPaywall 一并清），不会留下悬空的系统弹窗 */
    closeKbPaywall();
    state.kbCollapsed=false;
  }
  /* 收起键盘：点宿主聊天区域（消息区 / 会话头部，不含输入栏）—— 键盘的任何状态与页面
     都由 kbReset() 一次清干净，收起后手机里只剩状态栏 + 会话头部 + 消息区（吃满剩余高度）+ 输入栏。
     已经收起时不再重渲染（点聊天区域是幂等的，也不该把宿主输入框的焦点来回抢）。 */
  function collapseKeyboard() {
    if(state.kbCollapsed)return;
    kbReset();
    state.kbCollapsed=true;
    render();
  }
  /* 弹出键盘：收起态下点宿主输入框（#host）才走这里 —— 键盘回到底座形态
     （菜单栏 + 字母层，布局沿用设置里选的那套），光标交回输入框。
     键盘已激活（未收起）时不做任何操作：那次点击只更新光标锚点与下划线镜像（见 bind）。
     唤起即做键盘侧的前置检查（真键盘一弹起就检查）：先看完全访问权限、再看登录状态 ——
     没权限先弹「完全访问引导页」、未登录再弹登录层，都满足才铺底座键盘。 */
  function expandKeyboard() {
    if(!state.kbCollapsed)return;
    kbReset();
    if(checkKbEntry())return;
    render();
  }
  /* —— 键盘被唤起时的前置检查（顺序固定：**先完全访问权限、后登录状态**）——
     检查时机四处（都是「键盘在屏 / 刚被唤起」的时刻）：① 点宿主输入框把收起的键盘唤回
     （expandKeyboard）；② 启动时键盘常驻（见文件末尾）；③ 左栏「键盘完全访问」/「登录状态」
     两个开关被切（仿真工具，立刻反映真实逻辑）；④ 切到需要授权的平台（platform 动作）。
     收起键盘（点宿主聊天区域）走 kbReset()，两层覆盖层随之收起，下次唤回再检查一次。 */
  function checkKbEntry() {
    /* 「开启键盘」关着时键盘不在屏（渲染成 kb-off 占位），不存在「键盘被唤起」这回事 ——
       这一环不弹任何键盘侧覆盖层（否则只会在看不见的地方留下状态；等「开启键盘」打开那一刻
       由 #perm-kb-enabled 的 change 重跑一遍，见下） */
    if (!state.permissions.kbEnabled) return false;
    if (checkKbFullAccess()) return true;
    return checkKbLogin();
  }
  /* —— 键盘完全访问引导层（kb-full-access 组件）——
     权限名按平台取系统里的叫法（iOS「允许完全访问」、鸿蒙「完整访问」）；Android 系统上这个权限
     默认开启，所以只在 Android 上跳过这道检查。引导层与登录层互斥（先权限后登录，不会同时出现）。 */
  function fullAccessGranted() { return state.platform === 'android' || state.permissions.keyboard; }
  function needsFullAccess() { return !fullAccessGranted(); }
  function openKbFullAccess() {
    abortVoiceHold();
    closeKbLogin();
    state.kbFullAccess = true;
    /* 与登录层同一套滑入动画：只在弹出那一次渲染播放（重渲染不带 .entering 就不重放） */
    state.pickerEnter = true; render(); state.pickerEnter = false;
  }
  function closeKbFullAccess() { state.kbFullAccess = false; }
  /* 唤起 / 启动时的完全访问检查：没开权限即弹出引导层（返回 true 表示已经渲染过，调用方别再渲染） */
  function checkKbFullAccess() {
    if(!needsFullAccess())return false;
    openKbFullAccess();
    return true;
  }
  /* 引导层的「去开启」= 仿真「去系统设置开启完全访问」：把权限置成已开启，接着补一次登录检查
     （先权限后登录这条链路的下一环），都满足才回键盘。
     引导链路（切换键盘之后 → 演示之前）中途走这里时改走 guideToDemo —— 接着补登录 / 资料引导，
     最后开演演示（2026-10-08 需求，见 guideAfterSwitch）。 */
  function grantKbFullAccess() {
    state.permissions.keyboard = true;
    state.kbFullAccess = false;
    if(state.guideDemoPending)return guideToDemo();
    if(checkKbLogin())return;
    render();
  }
  /* —— 键盘内登录层（kb-login 组件）：未登录时的登录页，覆盖整个键盘 UI 区域 ——
     形态二选一由「设备权限 › 蜂窝网络」决定：打开（= 已插卡且有蜂窝网络）走本机号一键登录，
     关闭（无卡 / 未开蜂窝网络）走手机号验证登录。
     它是前置检查的第二环（第一环是完全访问权限，见 checkKbEntry）：完全访问已开、又未登录时
     才弹它。收起键盘（点宿主聊天区域）走 kbReset()，登录层随之收起，下次唤回再检查一次。 */
  function kbLoginMode() { return state.permissions.cellular ? 'one-tap' : 'sms'; }
  /* 短信形态的「登录」按钮可用条件：11 位手机号 + 6 位验证码（填齐才从淡紫禁用态变实色） */
  function kbLoginReady() { return /^1\d{10}$/.test(state.kbLoginPhone) && /^\d{6}$/.test(state.kbLoginCode); }
  /* 打开时重置表单：手机号缺省给仿真测试号（与主 App 登录页同一个 13800138000），
     验证码 / 发送态 / 发码状态每次重开都清（一键登录的协议勾选保留，不反复打断用户） */
  function resetKbLoginForm() {
    state.kbLoginPhone = state.kbLoginPhone || '13800138000';
    state.kbLoginCode = ''; state.kbLoginSent = false; state.kbLoginBusy = false;
  }
  function openKbLogin(mode = kbLoginMode()) {
    abortVoiceHold();
    closeKbLogin();
    /* 两层互斥：登录是「先权限后登录」的第二环，弹它时把完全访问引导层收起 */
    closeKbFullAccess();
    state.kbLogin = mode;
    resetKbLoginForm();
    state.pickerEnter = true; render(); state.pickerEnter = false;
  }
  /* 唤起 / 启动时的登录检查：未登录即拦下（返回 true 表示已经渲染过，调用方别再渲染）。
     两种形态两条路（2026-09-29 起分家）：主 App 进登录**独立页面**（openAppLogin，按蜂窝网络
     落「一键登录」/「手机号登录」两页之一），键盘仍弹覆盖层（openKbLogin）。 */
  function checkKbLogin() {
    if(state.loggedIn)return false;
    if(state.appView==='app'){openAppLogin();return true;}
    openKbLogin();
    return true;
  }
  /* 收起登录层（X / Esc / 登录成功提示播完共用）：顺带把成功提示的定时器摘掉；
     压在登录层上面的协议正文页（kb-legal）也一并收起 —— 它只为登录层的协议名服务 */
  function closeKbLogin() {
    clearTimeout(state.kbLoginTimer); state.kbLoginTimer = null;
    state.kbLogin = '';
    state.kbLegal = '';
    /* 主 App 登录页的「请阅读并同意以下条款」弹框跟着登录层一起收（它只为这两页服务，见 askKbConsent） */
    state.kbConsentAsk = false; state.kbConsentNext = '';
  }
  /* —— 主 App 的登录独立页面（2026-09-29 需求：不再是覆盖层；同日晚些按需求拆成两页）——
     mode='sms' → appScreen='login'「手机号登录」页（短信验证码表单）；
     mode='one-tap' → appScreen='login-one-tap'「一键登录」页（形态 = 键盘内一键登录弹窗那套）。
     两页都是同一套 kb-login 组件整页直出（appScreenContent、无底部 Tab，见 renderApp / appTabBar）；
     state.kbLogin 仍是两种形态共用的表单状态。真实链路（状态检查链 / needLogin）按
     kbLoginMode()（蜂窝网络开关）选落点；两页之间用页内入口互跳（kb-login-sms 动作）。
     appLoginReturn 记来路页：X / Esc 关掉、登录成功收尾都回到那一页（覆盖层时代的「停在原页」）；
     在两页之间互跳不算来路变更（appLoginReturn 保持进第一页时记的那一页）。
     两页上未勾选协议就点主按钮的提示也与键盘形态分家（2026-09-29 需求）：不抖协议行，
     改成弹「请阅读并同意以下条款」弹框（askKbConsent / kb-consent-agree，键盘形态照旧抖）。
     **进这两页时协议勾选回到未勾选**（2026-09-29 需求：手机号页面默认不勾选协议）——
     键盘形态仍共用同一份状态（就地换表单保留勾选），主 App 每次进页 / 页间互跳都从默认态开始。
     落点仍按 kbLoginMode()（蜂窝网络开关）二选一：一键 / 手机号两页都是缺省值，
     未登录点「我的」Tab 那次延迟弹出（2026-10-04 需求，见 ACCOUNT_LOGIN_DELAY_MS）也走这条缺省。 */
  /* 未登录点「我的」Tab：先进「我的」页，隔这么久再弹登录页（2026-10-04 需求）——
     让用户先看见这一页（问候行此刻是「立即登录」），再走登录。 */
  const ACCOUNT_LOGIN_DELAY_MS = 500;
  function openAppLogin(mode = kbLoginMode()) {
    abortVoiceHold();
    /* 「我的」Tab 那次延迟弹出的定时器到点前先作废：登录页已经由别的路径打开了，别再弹一次 */
    clearTimeout(state.appLoginDelayTimer); state.appLoginDelayTimer = null;
    /* 登录页要与「用户」页的编辑弹层互斥（退出登录等路径进来时不留残层） */
    state.userSheet = '';
    closeKbLogin();
    /* 与键盘侧同一套互斥：登录是「先权限后登录」的第二环，进登录页时收起完全访问引导层 */
    closeKbFullAccess();
    if(state.appScreen!=='login'&&state.appScreen!=='login-one-tap')state.appLoginReturn = state.appScreen;
    state.kbLogin = mode;
    resetKbLoginForm();
    state.kbLoginConsent = false;
    state.modal = '';
    state.appScreen = mode==='one-tap' ? 'login-one-tap' : 'login';
    state.pickerEnter = true; render(); state.pickerEnter = false;
  }
  /* 关掉登录页（X / Esc / 登录成功收尾共用）：回来路那一页（没有来路就落首页） */
  function closeAppLogin() {
    closeKbLogin();
    state.appScreen = state.appLoginReturn || 'home';
    state.appLoginReturn = '';
    /* 从引导链路被拦到登录页、又主动退出的：这一次引导到此为止（演示待演标记一并清掉 ——
       回到引导页后重新选一次 LoveCo 会重新走「登录 → 资料引导 → 演示」这条链路，见 guideAfterSwitch） */
    state.guideDemoPending = false;
    /* 退出登录页恰好回首页 = 这一轮首启链路到此为止（见 clearFirstLaunch） */
    if(state.appScreen==='home')clearFirstLaunch();
  }
  /* —— 键盘内协议正文页（kb-legal 组件）：登录层协议行里点协议名打开 ——
     正文与主 App 协议正文页同一份快照（legal-data.js），只是缩到键盘这一条高度里滚动浏览。
     X / Esc 关掉只收起本页、回登录层（协议勾选状态不动）；关闭登录层 / kbReset 时随登录层一并收起。 */
  function openKbLegal(key) {
    if (!window.LOVECO_LEGAL || !window.LOVECO_LEGAL[key]) return;
    abortVoiceHold();
    state.kbLegal = key;
    /* 这一层自己的「从下往上弹出」：只在打开那一次渲染播放（登录层不跟着重播，见 kbLegalEnter） */
    state.kbLegalEnter = true; render(); state.kbLegalEnter = false;
  }
  function closeKbLegal() { state.kbLegal = ''; }
  /* —— 会员开通覆盖层（kb-paywall 组件，键盘形态专属）——
     触发一处：键盘形态发起生成时额度不足（左栏「模拟 › 模拟试用额度耗尽」打开：积分清零且非会员），
     generate() 拦下生成后打开。2026-09-28 起主 App 的购买走**会员购买页**（**2026-10-06 起
     就是「会员购买页 · 新」** purchase2-copy / appPurchasePlusCopyPage —— 第一个购买页 purchase
     与第二个购买页 purchase2 同日已按需求整页删除）：
     「会员中心」行 /「我的」会员卡片 / 主 App 额度不足 / 键盘安卓·鸿蒙跳转（gotoAppPurchase）
     四处入口都落那一页，不再弹这一层；
     本层商品仍是同一张表（PLANS）、同一个选中档位（state.kbPlan）。
     打开前把其它覆盖层收掉（同一时刻只留一层）—— 这一层只占**常规键盘那一块**
     （250px / 矮窗口 210px），得先把会把键盘拉高的面板收掉：聊天分析面板 / 选图选择器 /
     AI 分析过渡页 / 对象编辑面板还在的话，`.keyboard` 仍是 with-picker 的三分之二屏，
     这一层跟着 `inset:0` 就会铺满三分之二屏（不是键盘那一块）；对象管理页 / 设置页一并收掉。
     协议行不带勾选框（已按需求去掉；主 App 购买页照参考图带勾选，两边不同）：点「立即解锁」
     按平台分两路（2026-09-28 需求，见 action 的 purchase 分支）—— iOS 就地弹系统支付框
     （ios-pay-sheet，确认后才到账）；
     安卓 / 鸿蒙的键盘形态跳主 App 的会员购买页（gotoAppPurchase，到主 App 里再购买）。
     **不动 state.draft**：本次输入草稿留着，关掉这一层后可以再发起一次生成。 */
  function openPaywall() {
    abortVoiceHold();
    if (state.appView === 'keyboard') {
      state.modal=null;state.modalData={};
      stopScan();
      state.scanPanel=false;state.chatPanel=false;state.photoPanel=false;state.photoBack='';
      state.partnerPanel=false;state.settingsPanel=false;
      dismissKbEditor();
      /* 问AI 页同样会把键盘加高（标题栏 + 输入区），一并收掉 */
      dismissFreeChat();
    }
    state.kbPaywall=true;state.pickerEnter=true;render();state.pickerEnter=false;
  }
  /* X / Esc 关掉这一层：只收起覆盖层回原处（键盘形态回键盘、主 App 形态停原页；额度仍是 0，
     再发起生成还会弹）；协议正文页（kb-legal）可能是从这层的协议名点开的，一并收起；
     iOS 系统支付框（若开着）也一起收起 —— 它只为这一层的购买服务 */
  function closeKbPaywall() { state.kbPaywall=false;state.kbLegal='';state.iosPaySheet=false; }
  /* —— 会员开通层的「立即解锁」两个落点（2026-09-28 需求）——
     ① iOS：就地弹 iOS 系统支付框（App Store 内购确认，ios-pay-sheet 组件）—— 不跳转、也不到账，
        在支付框里确认（ios-pay-confirm）才走 completePurchase；
     ② 安卓 / 鸿蒙的键盘形态：键盘没有内购能力，跳转到主 App 的会员页 —— 切到主 App 形态、
        落到「我的」（会员入口所在页）并就地打开会员开通层（同一层、同一张商品表），
        到主 App 里再完成购买。
     安卓 / 鸿蒙的主 App 形态下点「立即解锁」不跳转（已经在主 App 了），走一键到账。 */
  function openIosPaySheet() { state.iosPaySheet=true;state.pickerEnter=true;render();state.pickerEnter=false; }
  function closeIosPaySheet() { if(state.paymentBusy)return; state.iosPaySheet=false; }
  /* —— 键盘安卓 / 鸿蒙点「立即解锁」的跳转落点（2026-09-28 起改跳会员购买页）——
     键盘没有内购能力，切到主 App 形态、直接落到会员购买页里再购买。
     **2026-10-06 需求：第一个会员购买页（purchase / appPurchasePage）已整页删除**，本函数与
     「会员中心」行、主 App 额度不足三处入口一起改落**「会员购买页 · 新」**（purchase2-copy /
     appPurchasePlusCopyPage）—— 进页后商品取 PLUS_PLANS、选中态取 state.pu2Plan（见 checkoutPlan）。 */
  function gotoAppPurchase() { openAppScreen('purchase2-copy'); }
  /* 当前结算档位：**会员购买页与键盘付费引导层两条链路共用这一个入口** ——
     「会员购买页 · 新」（appScreen='purchase2-copy'，2026-10-06 新增；**2026-10-06 起主 App 唯一的
     会员购买页** —— 四个入口都落它；第二个购买页 purchase2 与第一个购买页 purchase 同日已按需求
     整页删除；同日晚些需求本页由「会员购买页 · 新2」改回「会员购买页 · 新」这个名字）
     用 PLUS_PLANS 与选中态 state.pu2Plan；
     键盘会员开通层走 PLANS + state.kbPlan（原口径 —— 两张拷贝页 purchase-copy / purchase2-copy
     中只有后者留着，前者已按 2026-10-06 需求删除，勿再补回）。
     返回值带上 key（档位 id —— iOS 系统支付框的 MARKETING 与到账接口用它），
     档位取不到时给空对象（调用方自己兜）。 */
  function checkoutPlan() {
    if(state.appScreen==='purchase2-copy'){
      const p=PLUS_PLANS[state.pu2Plan];
      return p?Object.assign({key:state.pu2Plan},p):{};
    }
    const p=PLANS[state.kbPlan];
    return p?Object.assign({key:state.kbPlan},p):{};
  }
  /* 仿真支付（权益到账）：会员购买页「会员购买页 · 新」、会员开通层与键盘内付费引导共用这一步 ——
     现在由 iOS 系统支付框的确认动作（ios-pay-confirm）、安卓 / 鸿蒙主 App 形态的「立即解锁」
     （p2-buy / purchase）调用。**2026-10-06 起主 App 只剩「会员购买页 · 新」一张购买页**
     （第一个 purchase 与第二个 purchase2 同日整页删除，后者的主按钮原「购买 xx 会员」也已随页删除）。
     2026-09-26 起「确认模拟订单 → 权益已到账」两个中间页已删除，一次调用走完：
     按 days 置会员标识与到期日（永久档 0 = 永久），并把「模拟试用额度耗尽」的开关复位。
     档位取 checkoutPlan()（购买页与键盘付费层各取各的表与选中态，见其注释）。
     落点：连同支付框（若开着）与会员开通层一起收起、回原处（键盘形态回键盘、主 App 形态停原页）。 */
  async function completePurchase() {
    if(state.paymentBusy)return;
    state.paymentBusy=true;
    const item=checkoutPlan();
    try {
      await api('/mock/payments/notify',{planId:item.key||state.kbPlan,status:'success',actualCharge:0});
      state.member=true;state.memberExpiry=item.days?Date.now()+item.days*86400000:0;
      state.creditsOut=false;state.creditsSnapshot=null;
      state.paymentBusy=false;persist();
      state.iosPaySheet=false;state.kbPaywall=false;return render();
    }catch(e){state.paymentBusy=false;}return;
  }
  /* 交给 kb-legal 组件的正文数据（未打开 / key 不存在时为 null，组件整层不渲染） */
  function kbLegalDoc() {
    const d = window.LOVECO_LEGAL && window.LOVECO_LEGAL[state.kbLegal];
    return d ? { title: d.title || d.name || '协议正文', body: d.body || '暂未载入正文' } : null;
  }
  /* 未勾选协议就点主按钮的提示（2026-09-29 需求按形态分家）：
     ① 键盘形态 —— 让底部协议行抖一下提示先勾选（下面这个 shakeKbConsent）：不重渲染（重建 DOM
        会把动画一起重建）、也不用全局提示条（toast 组件已整体删除），就地在协议行上播一次：
        先摘类 + 强制重排，连点也能重放。键盘层只有一条键盘高，塞不下弹框；
     ② 主 App 的两张登录页（appScreen='login' / 'login-one-tap'）—— 不再抖协议行，改成弹
        「请阅读并同意以下条款」弹框（kb-login 组件的 .kbl-ask，照参考截图）：next 记下这次被
        拦下的动作名，点弹框里的「同意并继续」时视作勾选并接着把它跑完（见 action 的
        kb-consent-agree）；X（kb-consent-close）只收起弹框、仍不勾选。 */
  function shakeKbConsent() {
    const node = document.querySelector('.kb-login .kbl-consent');
    if(!node)return;
    node.classList.remove('shake');
    void node.offsetWidth;
    node.classList.add('shake');
    node.addEventListener('animationend', () => node.classList.remove('shake'), {once:true});
  }
  function askKbConsent(next) {
    state.kbConsentAsk = true;
    state.kbConsentNext = next;
    return render();
  }
  function closeKbConsentAsk() { state.kbConsentAsk = false; state.kbConsentNext = ''; }
  /* 登录成功后的收尾：一键登录与短信登录共用 —— 先给一记「登录成功」提示（登录层的收尾形态，
     KB_LOGIN_DONE_MS 之后自动收起），再回到键盘；状态落库，号码由调用方写进 state.phone。
     **性别还没设置时还要多走一步**（2026-09-28 需求）：登录层收起那一刻接着进「资料引导」
     （选择性别 → 你的出生日期，见 startOnboarding），走完才回首页 —— 「性别有没有设置」由左栏
     「模拟 › 已设置性别」仿真开关控制（**关 = 还没设置**（新设备就是这样），走完自动置成开）；
     开着（性别已设置）就照旧直接回；**首启引导期间无条件走这一步**（见 state.firstLaunch 的判定）。
     **引导链路（guideDemoPending）里则接着开演**（2026-10-08 需求：切完键盘 → 登录 →
     资料引导 → 「键盘使用引导（演示）」，演示收场才落首页 —— 见 guideAfterSwitch）。 */
  const KB_LOGIN_DONE_MS = 1000;
  function finishKbLogin() {
    state.loggedIn = true;
    persist();
    clearTimeout(state.kbLoginTimer);
    state.kbLogin = 'done';
    state.kbLoginTimer = setTimeout(() => {
      state.kbLoginTimer = null; state.kbLogin = '';
      /* 主 App 的登录页收尾：回来路那一页（appLoginReturn，见 openAppLogin）；键盘形态原地回键盘 */
      if(state.appView==='app'&&(state.appScreen==='login'||state.appScreen==='login-one-tap'))state.appScreen = state.appLoginReturn || 'home';
      state.appLoginReturn = '';
      /* 性别还没设置（「模拟 › 已设置性别」关着）就走资料引导 —— 这一步就是「检查一下性别有没有设置，
         没有就弹性别 / 生日页」；**「首启引导」开着时无条件走**（刚装上的 App 第一次登录必然要设
         性别 / 生日，哪怕「已设置性别」已经是开的也照走，2026-10-06 晚些需求） */
      if(!state.genderSet||state.firstLaunch) return startOnboarding();
      /* 引导链路（切换键盘之后 → 演示之前）：登录这一站走完接着开演「键盘使用引导（演示）」——
         演示收场才落首页、才排自动付费墙（2026-10-08 需求，见 closeKbUsageGuide / finishGuide） */
      if(state.guideDemoPending) return openKbUsageGuide(true);
      /* 打开 App 的自动付费墙（见 launchPaywall）：登录收尾正好落在**首页**时才排那次弹出
         （从其它页被拦去登录的，回来路照旧、不弹）；排完照旧渲染首页，1 秒后购买页从底部盖上来。
         **先排、再谈首启收尾**（顺序要紧）：排上了就挂起「首启尾巴」，下面那句 clearFirstLaunch
         会被它挡下 —— 这一轮付费墙还没走完，开关不能先关（2026-10-06 再晚些需求） */
      if(state.appView==='app' && state.appScreen==='home')launchPaywall();
      /* 落首页了 = 首启链路（如果有的话）到此为止 —— 没排自动付费墙时才真的关掉「首启引导」开关
         （见 clearFirstLaunch / state.firstLaunchTail） */
      if(state.appView==='app'&&state.appScreen==='home')clearFirstLaunch();
      render();
    }, KB_LOGIN_DONE_MS);
    render();
  }
  /* 点击页面列表项后把手机跳到对应页面：
     主 App 形态 = openAppScreen（id 与页面路由一致）；
     键盘形态 = 按条目设置键盘状态（覆盖层开关 / 打字态 / 键盘布局 / 选中对象…）。
     「AI 分析过渡页」不设定时器：避免 1 秒后自动切走，方便静态查看（真实链路里由 openScanPanel 播完接面板）。 */
  function setupPage(it) {
    /* 演示层收场（2026-09-29 需求）：演示层开着时从页面列表点入**其它**条目 = 离开演示 ——
       把它连同步骤定时器一并收掉，别让它继续盖在刚点入的页面上（此前只有 Esc 与
       「去使用」收场，演示层会一直压着新页面，看起来就像「跳到了演示页」） */
    if(state.kbGuideDemo && it.id!=='kb-usage-guide') closeKbUsageGuideSilent();
    if(state.appView==='app'){
      /* 从页面列表点入任意条目 = 离开主 App 里正在走的引导链路：演示待演标记一并清掉
         （此后从某个页面手动登录，不会再被续上「资料引导 → 演示」，见 guideDemoPending） */
      state.guideDemoPending = false;
      /* 键盘使用引导（kb-usage-guide 组件）：自绘的整机覆盖层，主 App 整机上也挂这一层 ——
         列表点入**不切 App形态**、就地从头开演（openKbUsageGuide 内部处理） */
      if(it.id==='kb-usage-guide')return openKbUsageGuide();
      /* 目录里的整屏流程子页（不在 appScreens 集合、从流程中途进入）：静态跳转补上运行上下文
         （原「确认模拟订单」「权益已到账」两条子页已随购买链路合并而删除） */
      if(it.id==='partner-new')return openAppScreen('partner-edit');
      if(it.id==='partner-edit'){const p=state.partners[0];return openAppScreen('partner-edit',p?{id:p.id}:{});}
      /* 「我的」与「我的 · 已开通会员」是**同一页（appScreen='account'）的两个形态**：
         点入各自摆成自己的那一态 —— 点「我的」= 未开通态（把会员态复位），
         点「我的 · 已开通会员」= 会员态（现场摆上会员与到期日 2026-09-30 —— 到期日显示在
         会员横幅内那一行「2026-09-30到期」（右对齐；问候行下方的会员标识行 2026-10-05 已按需求删除）。
         两条都不落库，刷新页面即回到真实会员状态。
         （2026-10-03 用户反馈：「从我的已开通会员页面无法切换到我的页面」—— 根因是会员态
         现场只摆不复位，点回「我的」时 member 仍为 true、页面看不出变化） */
      if(it.id==='account'){state.member=false;state.memberExpiry=null;return openAppScreen('account');}
      if(it.id==='account-member'){state.member=true;state.memberExpiry=new Date(2026,8,30).getTime();return openAppScreen('account');}
      /* 「用户」（原「个人资料」）：静态查看摆成已登录（页面读的是账号资料 —— 昵称 / 手机号 /
         性别 / 生日都取存档值），不落库、刷新即恢复 */
      if(it.id==='profile'){state.loggedIn=true;return openAppScreen('profile');}
      /* 「注销账号」（2026-10-04 需求）：与「用户」页同一来路，同样摆成已登录
         （页面本身不读登录态），不落库 */
      if(it.id==='cancel-account'){state.loggedIn=true;return openAppScreen('cancel-account');}
      /* 「协议正文」一条（2026-10-04 需求：协议由覆盖层改回整页后补登记；同日稍晚「协议中心」
         列表页按需求删除）：来路摆成「我的」页（返回箭头回那一页，见 legalBack）—— 点入时把
         state.legalFrom 摆成 'account'；正文停在《用户协议》（协议 key 取 legal-data.js
         的 terms）。不落库，刷新即恢复 */
      if(it.id==='legal'){state.legalKey='terms';state.legalFrom='account';return openAppScreen('legal');}
      /* 「关于 LoveCo」（2026-10-04 晚些需求）：从「我的」·「更多」进的整页直接落地，
         本页不读登录态、也不落库（返回箭头回「我的」） */
      if(it.id==='about')return openAppScreen('about');
      /* 「邀请有礼」（2026-10-05 新增）：页面本体不读登录态（邀请码 / 邀请记录都是存档数据），
         但真实入口在「我的」·「账户」组、由 needLogin 拦未登录 —— 静态查看照「用户」页口径
         现场摆成已登录（不落库，刷新即恢复真实状态） */
      if(it.id==='invite'){state.loggedIn=true;return openAppScreen('invite');}
      /* 「消息」（2026-10-05 需求）：页面本体不读登录态（一条静态续费提醒），直接落地；
         返回钮 / Esc 都回首页 */
      if(it.id==='messages')return openAppScreen('messages');
      /* 「问AI」（2026-10-06 需求）：页面本体不读登录态（发送时才由 needLogin 拦到登录页）；
         顶栏 X / Esc 都回首页，键盘问AI层随页面收起 */
      if(it.id==='app-ai')return openAppAi();
      /* 首次登录的「资料引导」两条：现场摆成「已登录 + 性别还没设置（「已设置性别」开关置关，不落库）」，
         分别停在对应那一步（性别已选 / 滚轮停在默认那天） */
      if(it.id==='onboard-gender'){state.loggedIn=true;state.genderSet=false;state.onboarding='gender';return openAppScreen('onboard');}
      if(it.id==='onboard-birthday'){state.loggedIn=true;state.genderSet=false;state.onboardPick={y:2006,m:9,d:28};state.onboarding='birthday';return openAppScreen('onboard');}
      /* 「开启键盘」引导流程（引导页三端各一条 + 模拟设置两页）：点引导页任一条目时
         先切到它对应的运行平台（引导页形态三端大致相同、演示动画素材按平台取，见 GUIDE_VIDEOS），
         再现场摆成「一台还没启用键盘的新设备」（与左栏关掉「开启键盘」同一套联动：
         键盘完全访问一并置关、当前输入法复位成系统默认）、落引导页（不落库 —— 刷新即恢复）；
         设置页 / 详情页保持当前开关状态，方便查看「已启用」后的形态；
         三条引导条目都顺手收起搁置着的两层覆盖层（完全访问 / 登录）—— 否则从别的页面
         带着层跳进来，层会一直盖在引导现场上（静态查看容易串台） */
      if(it.id==='kb-guide'||it.id==='kb-guide-android'||it.id==='kb-guide-ios'){
        state.platform=it.id==='kb-guide-android'?'android':it.id==='kb-guide-ios'?'ios':'harmony';
        persist();
        state.kbFullAccess=false;state.kbLogin=false;
        state.permissions.kbEnabled=false;state.permissions.keyboard=false;state.permissions.ime='system';state.appScreen='kb-guide';state.modal='kb-guide';state.kbGuidePage='guide';
        return render();
      }
      /* 模拟系统设置各条目都按端分叉渲染（见 appKbGuideScreen）：点入时各自把运行平台切到
         自己的那一版（鸿蒙三条切鸿蒙、iOS 两条切 iOS、安卓的设置页切安卓） */
      if(it.id==='kb-guide-settings'){state.platform='harmony';persist();state.kbFullAccess=false;state.kbLogin=false;state.kbGuidePage='settings';return openAppScreen('kb-guide');}
      if(it.id==='kb-guide-settings-ios'){state.platform='ios';persist();state.kbFullAccess=false;state.kbLogin=false;state.kbGuidePage='settings';return openAppScreen('kb-guide');}
      if(it.id==='kb-guide-settings-android'){state.platform='android';persist();state.kbFullAccess=false;state.kbLogin=false;state.kbGuidePage='settings';return openAppScreen('kb-guide');}
      if(it.id==='kb-guide-detail'){state.platform='harmony';persist();state.kbFullAccess=false;state.kbLogin=false;state.kbGuidePage='detail';return openAppScreen('kb-guide');}
      if(it.id==='kb-guide-detail-ios'){state.platform='ios';persist();state.kbFullAccess=false;state.kbLogin=false;state.kbGuidePage='detail';return openAppScreen('kb-guide');}
      /* 「切换到 LoveCo 键盘」（iOS / 鸿蒙引导第二步，2026-09-28 按设计截图补入）静态查看：
         摆成「键盘已启用、当前键盘还是系统键盘」那一刻（页面默认形态：系统英文键盘 + 长按地球提示；
         「已切到 LoveCo」那条列表条目已删 —— 已切换形态只在真实链路里出现：在本页选择器里选
         LoveCo 就地切过去）。平台取当前这一端（该页 iOS / 鸿蒙共用，只有状态栏与 LoveCo 键盘的
         底栏按端不同）；停在安卓时回到 iOS 那一版（这一页是 iOS / 鸿蒙的第二步，安卓走键盘切换悬浮窗）。
         不走 openAppScreen（它会顺手收起悬浮窗 / 协议层，这里也顺手把引导流程的两层收起） */
      if(it.id==='kb-guide-switch'){
        if(state.platform==='android')state.platform='ios';
        persist();
        state.kbFullAccess=false;state.kbLogin=false;state.kbImeSwitch=false;state.kbSwitchPicker=false;
        state.permissions.kbEnabled=true;state.permissions.keyboard=true;
        state.permissions.ime='system';
        state.language='zh';state.layer='letters';state.composition='';state.t9Path=0;state.typing=false;state.shift=false;
        state.appScreen='kb-guide';state.modal='kb-guide';state.kbGuidePage='switch';
        return render();
      }
      /* 「键盘切换悬浮窗(安卓)」静态查看：摆成安卓引导页第二步那一刻 —— 键盘已启用（安卓下
         完全访问随之视为已开）、当前输入法还是系统默认（所以引导页亮着第二步 —— 第二步没有
         演示卡与说明，页面只剩两颗按钮），悬浮窗开着。不走 openAppScreen（它会顺手收起悬浮窗，见其注释） */
      if(it.id==='kb-guide-ime-switch'){
        state.platform='android';persist();
        state.kbFullAccess=false;state.kbLogin=false;
        state.permissions.kbEnabled=true;state.permissions.keyboard=true;state.permissions.ime='system';
        state.appScreen='kb-guide';state.modal='kb-guide';state.kbGuidePage='guide';state.kbImeSwitch=true;
        return render();
      }
      /* 「键盘权限」「登录」两组里的两条键盘同款覆盖层（2026-09-29 起登记进主 App 目录）：
         完全访问引导层 —— 现场把「键盘完全访问」置成关（停在安卓时切到 iOS：安卓默认就有该权限、不弹这层）；
         登录层 —— 现场置成未登录（表单形态随「设备权限 › 蜂窝网络」开关取）。两条点入都顺手关掉搁置着的
         其它层与协议正文 / iOS 支付框（同一时刻只留一层，与真实链路的互斥做法一致）；均不落库 —— 刷新即恢复真实状态。
         同日补登记的第三条「会员开通覆盖层」（app-paywall）已按需求从目录删除（真实链路不弹、
         购买改走会员购买页），点入摆态的 case 一并撤掉 —— 同层条目只留在键盘目录（kb-paywall） */
      if(it.id==='app-full-access'){if(state.platform==='android'){state.platform='ios';persist();}state.kbPaywall=false;state.kbLegal='';state.iosPaySheet=false;state.permissions.keyboard=false;return openKbFullAccess();}
      if(it.id==='app-login'){state.kbPaywall=false;state.kbLegal='';state.iosPaySheet=false;state.loggedIn=false;return openAppLogin('sms');}
      if(it.id==='app-login-one-tap'){state.kbPaywall=false;state.kbLegal='';state.iosPaySheet=false;state.loggedIn=false;state.permissions.cellular=true;return openAppLogin('one-tap');}
      /* 「会员购买 · 优惠券」（2026-10-06 需求补登记）：**「会员购买页 · 新」的第二种形态** —— 点入先落
         那张购买页（进页默认态：永久档 / 支付宝 / 协议未勾选 / 无协议确认框），再把「永久会员立减优惠」
         挽留弹窗摆出来（`openOfferSheet` 的 save=false：**只摆形态、不落库**，不消耗当天那一次真实
         机会、刷新即恢复）。弹窗里的按钮走的仍是真实链路（x = 放弃优惠退出、「领取优惠」直接进支付）。 */
      if(it.id==='purchase2-offer'){openAppScreen('purchase2-copy');return openOfferSheet(false);}
      return openAppScreen(it.id);
    }
    switch(it.id){
      /* 键盘收起态：kbReset() 会把 kbCollapsed 复位成 false，所以要在它之后再置回 true */
      case 'host-chat-collapsed': kbReset(); state.kbCollapsed=true; return render();
      case 'kb-toolbar-default': kbReset(); state.selectedPartner='none'; return render();
      case 'kb-toolbar-partner': { kbReset(); const p=person()||state.partners[0]; if(p)state.selectedPartner=p.id; return render(); }
      /* 菜单栏「待分析截图」形态（静态查看）：现场补一张「刚刚的截图」挂上待分析标记，
         并把三关（键盘完全访问 / 登录 / 相册完整访问）一并置成通过 —— 此刻相册图标就是
         那张截图的缩略图（持续放大缩小），点它即真实走一遍 AI 分析链路 */
      case 'kb-toolbar-shot': kbReset(); state.permissions.keyboard=true; state.loggedIn=true; state.permissions.photos='full'; state.pendingShot=makeScreenshot().id; return render();
      case 'kb-candidates': kbReset(); state.language='zh'; state.composition='n'; state.typing=true; return render();
      /* 问AI 页（与 AI 对话的页面）：kbReset() 已把这一页收起（含提问内容以外的状态），
         这里按真实入口重新打开 —— 输入框留空、没有附图（真实链路里发送后也会清空），停在默认样式上 */
      case 'kb-free-chat': kbReset(); state.freeText=''; state.selectedPhotos=[]; state.freeShortcut=''; return openFreeChat();
      /* 打字形态：与真实链路一致 —— 组合串落在提问输入框里（拼音字母 + 下划线），顶部标题栏那行换成候选词栏 */
      case 'kb-free-chat-typing': kbReset(); state.freeText=''; state.selectedPhotos=[]; state.freeShortcut=''; openFreeChat(); state.language='zh'; state.composition='ni'; state.t9Path=0; state.typing=true; return render();
      /* 选图形态：带一张附图（缩略图行 + 网格里的序号 1；快捷栏常驻、与附图无关），
         再把输入行下方的键区换成图片选择器网格 —— 输入行右端那枚按钮此时是蓝色「发送」 */
      case 'kb-free-picker': kbReset(); state.freeText=''; state.selectedPhotos=photoItems()[0]?[photoItems()[0].id]:[]; openFreeChat(); return openFreePicker();
      /* 按住说话：同一现场再叠上按住态遮罩（遮罩与键盘区域同高，整块键盘都在里面） */
      case 'kb-free-voice': kbReset(); state.freeText=''; state.selectedPhotos=photoItems()[0]?[photoItems()[0].id]:[]; openFreeChat(); openFreePicker(); state.voiceHold={cancel:false,y0:0,pid:-1,source:'free'}; return render();
      /* 完全访问引导层（静态查看）：把运行平台置成 iOS、左栏「键盘完全访问」置成关（两处都反映在
         界面上），再弹出引导层；它不设收起定时器，停在两张引导图的轮播动画里便于查看 */
      case 'kb-full-access': kbReset(); state.platform='ios'; state.permissions.keyboard=false; persist(); return openKbFullAccess();
      /* 键盘内登录层三条：登录是「先权限后登录」的第二环，所以静态查看时把「键盘完全访问」置成已开
         （否则按真实链路该先弹引导层）；前两条补上「未登录」，并按其形态设置「蜂窝网络」开关
         （它决定默认弹哪张登录页，见 kbLoginMode）；「登录成功」那条是登录后那一瞬间的样子，
         状态置为已登录、也不设收起定时器（留在这一形态便于查看） */
      case 'kb-login-one-tap': kbReset(); state.permissions.keyboard=true; state.loggedIn=false; state.permissions.cellular=true; return openKbLogin('one-tap');
      case 'kb-login-sms': kbReset(); state.permissions.keyboard=true; state.loggedIn=false; state.permissions.cellular=false; return openKbLogin('sms');
      case 'kb-login-done': kbReset(); state.permissions.keyboard=true; state.loggedIn=true; state.kbLogin='done'; return render();
      /* 协议正文页（静态查看）：按真实链路先摆好登录层（键盘完全访问已开 + 一键登录形态），
         再就地打开「用户协议」那份正文 —— 停在协议正文上，X 一关就回登录层 */
      case 'kb-legal': kbReset(); state.permissions.keyboard=true; state.loggedIn=false; state.permissions.cellular=true; state.kbLogin='one-tap'; resetKbLoginForm(); state.kbLegal='terms'; state.kbLegalEnter=true; render(); state.kbLegalEnter=false; return;
      case 'kb-zh-qwerty': kbReset(); state.language='zh'; state.layout='qwerty'; persist(); return render();
      case 'kb-en-qwerty': kbReset(); state.language='en'; return render();
      case 'kb-t9': kbReset(); state.language='zh'; state.layout='t9'; persist(); return render();
      case 'kb-t9-typing': kbReset(); state.language='zh'; state.composition='53'; state.t9Path=0; state.typing=true; return render();
      case 'kb-numbers': kbReset(); state.layer='numbers'; return render();
      case 'kb-symbols': kbReset(); state.layer='symbols'; return render();
      /* 宿主输入栏两形态：空态清空输入框；输入中放一句示范文本（光标带到末尾） */
      case 'composer-empty': kbReset(); state.host=''; state.hostCaret=0; return render();
      case 'composer-typing': kbReset(); state.host='今晚一起去散步吗？'; state.hostCaret=state.host.length; return render();
      case 'partner-manager': kbReset(); state.partnersRemoving.clear(); state.partnerPanel=true; state.panelEnter=true; render(); state.panelEnter=false; return;
      /* 空列表形态：只置渲染用的演示标记（不动 partners 数据，kbReset 已先清一次）——
         与「对象被真的删光」是同一块空态 */
      case 'partner-manager-empty': kbReset(); state.partnersEmptyDemo=true; state.partnersRemoving.clear(); state.partnerPanel=true; state.panelEnter=true; render(); state.panelEnter=false; return;
      case 'kb-partner-editor': kbReset(); return openKbEditor();
      case 'kb-partner-edit': { kbReset(); const p=state.partners[0]; return openKbEditor(p?{id:p.id}:{}); }
      case 'kb-settings': kbReset(); state.settingsPanel=true; state.panelEnter=true; render(); state.panelEnter=false; return;
      /* 选择器三种权限形态：把左栏「设备权限 › 相册访问权限」一并置成该形态对应的档位再开面板
         （权限本身就是左栏控件，静态查看时一并置位，左栏显示的也就是这一档） */
      case 'photo-picker': kbReset(); state.permissions.photos='full'; return openPhotoPanel();
      case 'photo-picker-limited': kbReset(); state.permissions.photos='limited'; return openPhotoPanel();
      case 'photo-picker-denied': kbReset(); state.permissions.photos='denied'; return openPhotoPanel();
      case 'kb-scan': kbReset(); stopScan(); state.scanPanel=true; state.scanStartedAt=performance.now(); state.pickerEnter=true; render(); state.pickerEnter=false; return;
      /* 加载 / 输出态同样是截图分析那条链路的结果结构（简报 + 三张卡）——
         loading 也要有 pendingBrief，面板打开时才渲染得出简报区 */
      case 'chat-loading': kbReset(); state.pendingBrief=makeBrief(); state.draftKind='chat'; state.draft='今天有点累，感觉什么都没做好。'; return openChatPanel();
      case 'chat-stream': kbReset(); state.results=makeIdeas(); state.pendingBrief=makeBrief(); state.pending=false; openChatPanel(); return startStream();
      /* done 静态态：面板停在「输出完毕」的样子（三组建议 + 底部三个按钮） */
      case 'chat-done': kbReset(); return chatStatic('chat');
      /* 内容拦截（静态查看）：面板停在拦截态 —— 顺带把左栏「模拟安全拦截」置开（不落库，与选择器
         权限静态页同一做法：左栏开关显示的就是这一场景；draft 只为链路完整、拦截态不展示输入） */
      case 'chat-blocked': kbReset(); state.outcome='blocked'; state.draftKind='chat'; state.draft='今天有点累，感觉什么都没做好。'; state.chatPanel=true; state.chatPhase='blocked'; state.pickerEnter=true; render(); state.pickerEnter=false; return;
      /* 语音追问后的 AI 通用回复（静态查看）：面板停在 done 态，内容是那句语音指令
         交给 AI 后重新生成的结果（简报 + AI 回复 + 回复思路） */
      case 'chat-voice-general': kbReset(); return chatStatic('review');
      case 'photo-picker-avatar': kbReset(); openKbEditor(); return openPhotoPanel([], 'avatar');
      /* 按住说话遮罩（发送 / 上滑取消两形态）：静态查看形态 —— pid 置 -1 让 move/up 不匹配，遮罩常驻直到离开本页（kbReset 清场） */
      case 'voice-hold': case 'voice-hold-cancel': kbReset(); chatStatic('chat'); state.voiceHold={cancel:it.id==='voice-hold-cancel',y0:0,pid:-1,source:'panel'}; return render();
      /* 平台外观：切到对应平台看状态栏 / 键盘底栏的整体差异（与「运行平台」切换器一致，持久化） */
      case 'platform-ios': case 'platform-harmony': case 'platform-android': kbReset(); state.platform=it.id.slice('platform-'.length); persist(); return render();
      /* 键盘内付费引导（静态查看）：现场把额度置成耗尽（已登录、非会员、积分 0、开关打开）——
         不落库，刷新即恢复；随后弹出这一层，停在三档商品与「立即解锁」上便于查看 */
      case 'kb-paywall': kbReset(); state.loggedIn=true; state.member=false; state.credits=0; state.creditsOut=true; return openPaywall();
      /* iOS 系统支付框（静态查看）：摆成「iOS 上额度过期、在会员开通层里点过『立即解锁』」那一刻 ——
         平台切 iOS（支付框只在 iOS 出现，落库与「平台外观 · iOS」条目一致）、额度过期（不落库），
         会员开通层 + 系统支付框两层一起开着 */
      case 'kb-ios-pay': kbReset(); state.platform='ios'; persist(); state.loggedIn=true; state.member=false; state.credits=0; state.creditsOut=true; openPaywall(); return openIosPaySheet();
      /* 键盘使用引导（演示层）：清场后从第一步（截图）开始播 —— 条目只在主 App 列表，
         键盘形态点不到这里，保留同一入口兜底 */
      case 'kb-usage-guide': kbReset(); return openKbUsageGuide();
      default: kbReset(); return render(); /* host-chat：清场后即为目标页面（离开按住说话等静态态也走这里） */
    }
  }
  /* 左栏「平台与app形态」板块：App形态 / 运行平台 / 当前输入法 三组切换器 —— 板块跨平台、
     跨 App形态通用，键盘与主 App 两个形态共用同一段结构；页面列表已移到右栏整节（见 pageListSection）。
     「当前输入法」2026-09-29 起从「设备权限」挪到运行平台下面（默认系统默认）：它跟另外两组一样
     是「这台设备此刻用哪套界面」的选择而非权限；两档仍走 ime 动作（见 action），渲染跟随
     render()（主 App 下转发 renderApp()），两个形态无需各写一套。 */
  function deviceSwitchers() {
    const ime=state.permissions.ime;
    return `<div class="switcher"><span class="switch-label">App形态</span>${surfaceButtons()}</div><div class="switcher"><span class="switch-label">运行平台</span>${platformButtons()}</div><div class="switcher"><span class="switch-label">当前输入法</span><div class="segmented" role="group" aria-label="当前输入法">${[['system','系统默认'],['loveco','LoveCo']].map(([id,name])=>`<button data-action="ime:${id}" class="${ime===id?'active':''}" aria-pressed="${ime===id}">${name}</button>`).join('')}</div></div>`;
  }
  /* 左栏「设备权限」整节：**设备级**而非某一种 App形态的控件 —— 切到主 App 只是换了一层 App，
     同一台设备的这些权限照旧存在，所以键盘模式与主 App 模式共用这一节（render / renderApp 都渲染它）。
     开关的监听统一在 bind() 里按 id 挂（查不到就跳过）、相册三档走 photos 动作，都是 render() 收尾
    —— render() 在主 App 下会转发 renderApp()，因此两处渲染同一份结构即可，无需各写一套。
     （「当前输入法」两档原在这里，2026-09-29 起挪到上面的「平台与app形态」板块、运行平台下面。） */
  function permissionSection() {
    const P=state.permissions;
    return `<div class="rail-section"><div class="rail-heading"><h2>设备权限</h2></div><div class="kv"><span>网络访问</span><strong>${P.network?'正常':'已关闭'}</strong></div><div class="control-line"><label for="perm-cellular">蜂窝网络</label><input id="perm-cellular" class="switch" type="checkbox" ${P.cellular?'checked':''}></div><div class="control-line"><label for="perm-kb-enabled">开启键盘</label><input id="perm-kb-enabled" class="switch" type="checkbox" ${P.kbEnabled?'checked':''}></div><div class="control-line"><label for="perm-kb-full">键盘完全访问</label><input id="perm-kb-full" class="switch" type="checkbox" ${P.keyboard?'checked':''}></div><div class="switcher"><span class="switch-label">相册访问权限</span><div class="segmented" role="group" aria-label="相册访问权限">${[['denied','关闭'],['limited','有限访问'],['full','完整访问']].map(([id,name])=>`<button data-action="photos:${id}" class="${P.photos===id?'active':''}" aria-pressed="${P.photos===id}">${name}</button>`).join('')}</div></div></div>`;
  }
  /* 右栏「页面列表」整节：按当前 App形态列出全部页面 / 组件形态，组名可折叠，点条目手机即跳到该页面。
     原先它是左栏「运行平台」底下的一组切换器，现独占右栏一栏（左栏改放设备权限 + 模拟）。 */
  function pageListSection() {
    return `<div class="rail-section"><div class="rail-heading"><h2>页面列表</h2></div><div class="page-list" id="page-list">${pageList()}</div></div>`;
  }
  /* 主 App 的页面集合（页面列表里登记、openAppScreen 可跳的整页）。
     2026-09-26 按需求删掉 8 个页面：`checkout` 确认模拟订单 / `paid` 权益已到账 / `orders` 模拟订单 /
     `redeem` 兑换积分 / `tickets` 我的反馈 / `legal` 协议正文 / `support` 在线客服 / `settings` 键盘设置
     —— 其中协议正文当时降级成覆盖层（state.appLegal；**2026-10-04 按需求又改回整页**，
     见 appLegalPage，覆盖层字段已删），购买链路合并成一步直接到账（见 purchase 动作），
     其余连入口一并删除，勿再补回。
     同日晚些又删 2 个：`login` 登录 LoveCo / `membership` 会员与积分 —— 两个整页都不再存在，
     登录改弹**键盘同款的登录覆盖层**（kb-login 组件，见 openKbLogin / needLogin），
     会员开通改弹**键盘同款的付费覆盖层**（kb-paywall 组件，见 openPaywall），
     两处与键盘形态共用同一套设计与同一张商品表（PLANS），主 App 这边不再另做一套，勿再补回整页。
     2026-09-28 曾按需求补回一个整页 `purchase` 会员购买页（appPurchasePage，参考竞品购买页布局）——
     **2026-10-06 已按需求整页删除**（APP_PAGES 条目、`appPurchasePage()`、路由、appScreens 登记、
     guide-purchase 皮肤类、purchase-close 动作与 styles/theme 两组 `.pu-*` 样式一并删净，勿再补回）：
     它原先的三处入口（「会员中心」行 / 主 App 额度不足 / 键盘安卓·鸿蒙跳转）全部改落 `purchase2-copy`。
     2026-10-05 曾补一个整页 `purchase2`「L+ 会员」（appPurchasePlusPage，照设计图 1:1）——
     **2026-10-06 已按需求整页删除**（APP_PAGES 条目、`appPurchasePlusPage()`、路由与七处登记
     一并删净，勿再补回），「我的」页的会员卡片同日改落 `purchase2-copy`。
     2026-10-05 同日还补过一条 `purchase-copy`「会员购买2」（第一个购买页的拷贝）——
     **2026-10-06 已按需求整页删除**（appPurchaseCopyPage 与它的 APP_PAGES 条目、路由、
     theme.css 的 `.pu-copy-*` 修饰类一并删净，勿再补回）。
     2026-10-06 再补一条 `purchase2-copy`「会员购买页 · 新」（appPurchasePlusCopyPage；
     2026-10-06 晚些需求起用这个名字，最初登记为「会员购买页 · 新2」）——
     第二个购买页 `purchase2` 的**拷贝**（原页删除后本页仍在）；它用 PLUS_PLANS + state.pu2Plan
     （结算见 checkoutPlan），独自演进。**同日第一个购买页也整页删除后，本页成了主 App 唯一的
     会员购买页** ——「会员中心」行 /「我的」会员卡片 / 主 App 额度不足 / 键盘安卓·鸿蒙跳转
     四处入口都落它（见 gotoAppPurchase / generate / action 的 app-membership 分支）。
     键盘内的付费引导层（kb-paywall）随之回归键盘形态专属。
     2026-09-29 再按需求把登录改回**独立页面**（用户原话「手机号登录 不是覆盖层，而是独立的页面」）：
     appScreen='login'、同一套 kb-login 组件整页直出（见 openAppLogin / closeAppLogin / appScreenContent），
     页名就叫「手机号登录」；键盘形态仍是覆盖层（openKbLogin）不变。
     同日晚些再按需求拆成两页：appScreen='login-one-tap'「一键登录」页独立出来（页面 = 键盘内
     一键登录弹窗那套）、「手机号登录」页固定短信表单 —— 真实链路按蜂窝网络开关二选一落页，
     一键登录页的「手机号登录」入口跳独立页（不再是键盘里的就地换表单）。
     2026-09-29 再按需求改一处细节：这两页上未勾选协议就点主按钮**不再抖协议行**，改成弹
     「请阅读并同意以下条款」弹框（kb-login 组件的 .kbl-ask，见 askKbConsent）；键盘形态照旧抖。
     2026-10-04 晚些再补一个整页：`about`「关于 LoveCo」（appAboutPage，从「我的」·「更多」进）——
     它是协议正文的上一层（本页里点协议名也进 legal，返回箭头回本页，见 openAppLegal）。 */
    /* `purchase` 第一个会员购买页（appPurchasePage）2026-10-06 已按需求整页删除、勿再补回 ——
       现在主 App 只有 `purchase2-copy`「会员购买页 · 新」一张购买页 */
    const appScreens = new Set(['home','messages','app-ai','account','profile','cancel-account','feedback','legal','about','partners','purchase2-copy','login','login-one-tap','invite']);
  /* —— 主 App：底部 Tab 三页（首页 / 对象 / 我的）——
     主 App 形态的骨架 = 页面正文 + 底部 Tab 栏（首页 / 对象 / 我的，见 appTabBar）。
     **顶部没有导航栏**：状态栏之下直接就是正文，「我的」拿问候行当页头、「对象」拿
     「聊天对象 + 新建」那一行当页头，**首页自己就是一块整页深色内容**（2026-10-05 按设计图
     重做：标语区 + 两张功能卡 +「进入体验台」行，见 appHomePage），子页（用户、登录…）
     用卡片自带的标题行。回键盘形态不再有页头箭头；**首页那三处入口曾是主 App 内回键盘的路**
     （2026-10-05 起短暂有了，**2026-10-06 起三处入口改跳「问AI」页、不再回键盘形态** ——
     回键盘只剩工作台左栏的 App形态切换）。
     Tab 三页各有自己的整页结构（appHomePage /
     appPartnersPage / appAccountPage），子页里「用户」「注销账号」「协议正文」
     「问题反馈」「关于 LoveCo」与登录 / 购买各页也都有整页结构（见 appScreenContent）——
     2026-10-04 起**主 App 的子页全部是整页**，渲染工具里的 sheet 卡片只剩「仿真控制台」；
     子页不属于任何 Tab，但按归属给父 Tab 留一层选中态（见 APP_TAB_OF）。
     三页共用两块：会员横幅（memberBanner，未开通蓝底 / 已开通橙底）与分区卡片
     （appSection：灰色分组标题 + 白色圆角卡片，卡内一行 = appRow）。 */

  /* 会员标识行文案：永久档（memberExpiry === 0）→「永久会员」；有时限 →「会员到期日 YYYY-MM-DD」；
     老存档只有会员标识、没有到期信息（memberExpiry === null）→ 只说已解锁，不硬编日期。
     **2026-10-05 起只剩「邀请有礼」页在用**（领取成功的完成卡那行副说明）—— 「我的」页问候行
     下方那行金色会员标识已按需求整行删除，主 App 的会员到期日改由会员横幅内的「2026-09-30到期」
     一行承担（见 memberExpiryText / memberBanner）。 */
  function memberBadgeText() {
    if(state.memberExpiry===0)return '永久会员 · 已解锁无限次AI使用';
    if(state.memberExpiry>0){
      const d=new Date(state.memberExpiry);
      return `会员到期日 ${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
    return '已解锁无限次AI使用';
  }
  /* 会员横幅内那行到期日（2026-10-05 需求）：固定格式「2026-09-30到期」——
     **年月日都补零、年与日之间的分隔符是短横**（2026-10-05 晚些需求：原「2026年9月30日到期」，
     不补零、用中文年月日）；只在**有时限的会员**形态渲染 —— 永久会员（memberExpiry === 0）
     与老存档（null）都不显示这一行。**排版右对齐**（见 theme.css 的 .mb-expiry，
     与右侧胶囊 / 横幅右缘之间留 8px，不贴边）。 */
  function memberExpiryText() {
    const d=new Date(state.memberExpiry);
    const p=n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}到期`;
  }
  /* 会员横幅：「我的」用（原与首页共用，首页已清空）—— 未开通是蓝底「成为 LoveCo 会员」，
     已开通是橙底「LoveCo 会员」，右侧一颗白胶囊（「立即解锁」，**2026-10-05 需求：原「立即查看」**），
     点它进**「会员购买页 · 新」**（app-membership-plus 动作 → openAppScreen('purchase2-copy')；
     2026-10-05 新增的第二个购买页「L+ 会员」purchase2 **2026-10-06 已按需求整页删除**，
     这张卡片同日改落它的拷贝页；**同日第一个购买页 purchase 也整页删除**，「账户」组
     「会员中心」行（app-membership）一并改落这一页 —— 两处回到同一个落点）。
     **2026-10-05 「已开通会员」形态改版（本页需求）**：
       · 胶囊文案「立即解锁」→「**升级会员**」（未开通蓝底态的胶囊仍是「立即解锁」）；
       · 补一行到期日「**2026-09-30到期**」（memberExpiryText，年月日补零、短横分隔 ——
         2026-10-05 晚些需求由「2026年9月30日到期」改来）；**这一行挂右侧列、贴在胶囊正下方
         右对齐**（同日晚些再按需求调整：原先放在左侧文字列里、把横幅撑高一行 —— 现在胶囊上移、
         到期日在其下方，横幅高度与未开通态保持一致，见 theme.css 的 .mb-side / .mb-expiry；
         2026-10-06 晚些需求：到期日与胶囊贴得太近，间隙 3 → 8px 往下让一让；
         永久 / 老存档不显示这一行）；
       · 问候行下方原本那行金色会员标识（小方块「LoveCo」+「会员到期日 2026-09-30」）**整行删除**
         —— 主 App 的会员到期日现在只在横幅这一处（会员标识行 memberBadgeText 只剩邀请页在用）。
     **永久会员形态**（memberExpiry === 0，含左栏「模拟 › 会员状态」下拉选到永久档的场合）：
     标题写「**LoveCo 永久会员**」、右侧**不渲染升级按钮**、底下**不显示到期日行**（整卡仍可点，
     落点不变；永久会员没有到期日、也不用升级）。
     原「会员与积分」整页已于 2026-09-26 删除，键盘同款的会员开通覆盖层 2026-09-28 起主 App 不再弹。 */
  function memberBanner() {
    const on=state.member;
    const forever=on&&state.memberExpiry===0;
    const expiry=on&&!forever&&state.memberExpiry>0?`<small class="mb-expiry">${esc(memberExpiryText())}</small>`:'';
    /* 右侧列 .mb-side：胶囊在上、到期日行（有时限会员才有）贴在胶囊正下方右对齐 ——
       2026-10-05 需求：到期日原先混在左侧文字列里，把横幅撑高了一行；改挂右列后
       胶囊整体上移、横幅高度与未开通态一致（高度补偿见 theme.css 的 .is-member 内边距）。 */
    const side=forever?'':`<span class="mb-side"><span class="mb-cta">${on?'升级会员':'立即解锁'}</span>${expiry}</span>`;
    return `<button class="member-banner${on?' is-member':''}" data-action="app-membership-plus"><span class="mb-text"><strong>${on?(forever?'LoveCo 永久会员':'LoveCo 会员'):'成为 LoveCo 会员'}</strong><small>${on?'已解锁无限次AI使用':'解锁无限次AI使用'}</small></span>${side}</button>`;
  }
  /* 分区：灰色小标题 + 白色圆角卡片（卡内是若干 appRow） */
  const appSection = (title,rows) => `<section class="app-section"><h3 class="app-section-title">${esc(title)}</h3><div class="app-card">${rows}</div></section>`;
  /* 卡片里的一行：左标签 +（可选）右侧说明 + 折角箭头，整行可点（data-action 交给事件委托） */
  const appRow = (label,action,end='') => `<button class="app-row" data-action="${action}"><span class="app-row-label">${esc(label)}</span>${end?`<span class="app-row-end">${esc(end)}</span>`:''}<i class="chev" aria-hidden="true">${icon('ArrowRight')}</i></button>`;
  /* 两行式的一行（2026-10-04 需求）：上标题 + 下灰字副说明，
     右端照常折角箭头；**不给 action 时是纯展示行**（加 .app-row-static：不 hover、没有按下反馈）。
     2026-10-04 晚些：「关于 LoveCo」这一行接上了落地页（传 action='about' → 关于页）；
     2026-10-06 需求把那行的副说明版本号删掉后，本骨架暂无使用者（保留备用）。 */
  const appRowSub = (label,sub,action='') => {
    const inner = `<span class="app-row-text"><strong>${esc(label)}</strong><small>${esc(sub)}</small></span><i class="chev" aria-hidden="true">${icon('ArrowRight')}</i>`;
    return action ? `<button class="app-row" data-action="${action}">${inner}</button>` : `<div class="app-row app-row-static">${inner}</div>`;
  };
  /* 版本号：「关于 LoveCo」页品牌区的版本号（「我的」页「更多」组那行的副说明
     2026-10-06 已按需求删掉）—— 改版本只改这一处 */
  const APP_VERSION = '1.9.0';
  /* 备案号：「关于 LoveCo」页页尾那行 APP 备案信息 —— 改备案号只改这一处 */
  const APP_ICP = '鄂ICP备2026043044号-2A';
  /* 首页（2026-10-05 按设计图重做）：三块 ——
     ① **标语区** —— 两行大号主标语「让表达，自然一点。」+ 两行灰字副标语「回复有灵感，
        聊天有分寸。」+ 右侧双人插画（assets/illustrations/conversation_garden_v3.png）；
     ② **两张功能卡** —— 分析表达（深蓝卡面 + 放大镜插画）/ 自由对话（暖棕卡面 + 摊开的书插画），
        每张卡右上角一枚外链箭头、卡名下方一行灰字说明；
     ③ **「进入体验台」一行** —— 左侧键位图芯片 + 行名 + 折角箭头。
     设计图上还有的**「帮你回」模块与「好用，也要顺手」小节标题（连右侧「设置 ›」）按需求不做**，
     「进入体验台」下面那句「已就绪，聊天时切换即可用」也不做 —— 不要再当遗漏补回来。
     三处入口 **2026-10-06 起都进主 App「AI 咨询师」页**（openAppAi —— AI 咨询师聊天页，动作仍是
     home-analyze / home-free-talk / home-keyboard、三处同一落点；原先「离开主 App 回键盘形态」
     的走向作废，见「需求记录」2026-10-06 一条）。
     2026-10-05 晚些需求：① 正文整体**垂直居中**（内容不满一屏，富余高度上下均分，
     不再全部挤在顶部）；② 右上角加一枚**信封图标**（动作 home-msg）→ 进「消息」整页
     （见 appMessagesPage）。整页深色**按图定色、不跟随 .dark**（与问题反馈页 / 购买页那种做法一致）：
     状态栏连着一起转深色（.guide-home 挂手机根，见 renderApp），底部 Tab 栏在首页也换深色皮肤
     （见 theme.css 的 .app-phone.guide-home 一组）。
     2026-10-06 需求：**信箱有未读消息时，信封右上角浮一枚小红点**（state.msgUnread，
     皮肤 .hm-dot 在 theme.css 首页一组）—— 点信封进「消息」页即已读、红点熄灭；
     刷新页面回到「有未读」的初始态。
     2026-10-06 再晚些需求：**「限时特惠」悬浮卡**（offerBadge / state.offerBadge）——
     本页独有的第 ⑤ 块内容：放弃「永久会员立减优惠」挽留弹窗后，优惠资格再保留 3 分钟，
     本页浮出这颗可拖动的卡（卡详情见 offerBadge 的函数头注释；不在本页的 DOM 里 ——
     与浮层一串同挂在手机根上，见 renderApp）。 */
      function appHomePage() {
     const glyph = window.LoveCoSystemGlyphs;
     return `<div class="app-content app-page hm-page">
       <button class="hm-msg" data-action="home-msg" aria-label="消息">${glyph.envelope}${state.msgUnread?'<i class="hm-dot" aria-hidden="true"></i>':''}</button>
       <header class="hm-head">
        <div class="hm-head-text">
          <h1 class="hm-title">让表达，<br>自然一点。</h1>
          <p class="hm-sub">回复有灵感，<br>聊天有分寸。</p>
        </div>
        <img class="hm-art" src="assets/illustrations/conversation_garden_v3.png" alt="">
      </header>
      <div class="hm-cards">
        <button class="hm-card is-analyze" data-action="home-analyze">
          <img class="hm-card-art" src="assets/illustrations/analyze_tone_v1.png" alt="">
          <i class="hm-card-go" aria-hidden="true">${glyph.upRight}</i>
          <strong class="hm-card-title">分析表达</strong>
          <small class="hm-card-sub">读懂语气与情绪</small>
        </button>
        <button class="hm-card is-talk" data-action="home-free-talk">
          <img class="hm-card-art" src="assets/illustrations/open_ideas_v3.png" alt="">
          <i class="hm-card-go" aria-hidden="true">${glyph.upRight}</i>
          <strong class="hm-card-title">自由对话</strong>
          <small class="hm-card-sub">聊一聊，找灵感</small>
        </button>
      </div>
      <button class="hm-exp" data-action="home-keyboard">
        <span class="hm-exp-chip" aria-hidden="true">${glyph.kbdTiles}</span>
        <span class="hm-exp-label">进入体验台</span>
        <i class="chev" aria-hidden="true">${icon('ArrowRight')}</i>
      </button>
    </div>`;
  }
  /* —— 主 App · 消息页（appMessagesPage，appScreen='messages'）—— 2026-10-05 需求：
     首页右上角信封图标（home-msg）进来的**独立整页**（无底部 Tab、浅色、状态栏连着转白，
     .guide-msg 挂手机根）。**2026-10-06 需求：「消息」二字挪进页头顶栏** —— 页头改成与
     主 App 其余整页同一套 .app-page-head.user-head（返回箭头 + 居中标题同一行），原
     「圆形返回钮独立一行 + 下方大号浅灰页名」的排布作废。下方仍是一张浅灰通知卡 ——
     白色圆底时钟图标 + 标题「续费提醒」+ 说明「您的LoveCo会员将于5天后自动续期」
     （2026-10-06 同日改：原「您的L+会员…」）+ 右上角日期「09月25日」。
     卡内容是**静态演示文案**（原型里没有消息中心的数据结构，续费提醒的日期 / 天数不接
     state.memberExpiry 现算）。返回钮 / Esc 都回首页。 */
  function appMessagesPage() {
    return `<div class="ms-page">
      <div class="app-page-head user-head ms-head">
        <button class="user-back" data-action="msg-back" aria-label="返回">${icon('ArrowLeft')}</button>
        <h2>消息</h2>
        <span class="user-head-side" aria-hidden="true"></span>
      </div>
      <div class="ms-card">
        <span class="ms-ic" aria-hidden="true">${icon('Clock')}</span>
        <div class="ms-main">
          <strong class="ms-name">续费提醒</strong>
          <small class="ms-sub">您的LoveCo会员将于5天后自动续期</small>
        </div>
        <span class="ms-date">09月25日</span>
      </div>
    </div>`;
  }
  /* —— 主 App「AI 咨询师」页（appScreen='app-ai'，2026-10-06 需求）——
     首页三处入口（分析表达 / 自由对话 / 进入体验台）都进这一页：主 App 内与「AI 咨询师」
     的聊天页，结构自上而下三块 ——
     ① 顶部菜单栏：汉堡（三）开/收**历史抽屉** + 标题「AI 咨询师」+ 右端**新对话**（方框笔）与
        **X**（关页面回首页；Esc 同一条出口，抽屉开着时 Esc 只收抽屉）；
     ② 聊天记录（上半，自己滚）：用户消息靠右（文字灰底气泡 / 发出的聊天截图卡 —— 截图用
        core/kit.js 的 shot()，与键盘选图同一套画法）；AI 回复是靠左的浅灰大圆角卡，
        内容走 mdHtml 的 markdown（「## 对话解读」→ 分析段 →「## 版本N（策略名）」→ 结尾追问）；
     ③ 下半 = 贴底的输入栏（kb-free-chat 只出输入区，不出「问AI」标题栏；placeholder 固定
        「输入或按住说话」）—— **键盘不再是常驻的**（2026-10-06 晚些需求）：点输入框才调出
        **当前键盘**（LoveCo 键盘或系统键盘，见 aiKeyboardArea），点聊天记录区收起；
        点图片 / 头像从底部弹出 2 行图片高度的窗口（截图网格 / 对象列表，选完即收）。
        三种形态读同一份 state.freeChat / freeText / selectedPhotos —— 打字 / 候选词 / 选图 /
        按住说话全部与键盘形态一致。
     **发送链路与键盘共用**：sendFreeChat 按形态分流 —— 主 App 里不弹「AI 分析过渡页」与
     聊天分析面板，改走 appAiSend：这句话连同已选截图写进当前会话 → 「正在输入」三点气泡
     约 1.1s → AI 回复接在同一条记录里（带截图或「帮我回」= 聊天分析那条结构；纯文字提问
     = AI通用回复的 markdown，内容都沿用键盘那几份仿真文案）。
     会话数据都在页面内存（state.aiThreads / aiThread）：首次进页摆一条内置演示会话
     （照设计截图那轮问答）+ 两条历史空会话；新对话 / 切换即时生效，刷新回到内置演示。 */
  /* 顶部菜单栏的两枚一次性图形（icons.js 是生成物，这类一次性图形就地内联 ——
     与 kb-free-chat 的 SEND_ARROW 同一套做法）：汉堡 = 三条圆头横线；新对话 = 圆角方框
     + 右上一笔斜出的笔尖。 */
  const AI_GLYPH_MENU = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
  const AI_GLYPH_COMPOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" d="M12.5 4.5H7.4A3.4 3.4 0 0 0 4 7.9v8.7A3.4 3.4 0 0 0 7.4 20h8.7a3.4 3.4 0 0 0 3.4-3.4v-5.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path fill="none" d="M17.9 3.9a1.9 1.9 0 0 1 2.7 2.7l-7.3 7.3-3.6.9.9-3.6z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function appAiPage() {
    const ctx = uiContext();
    return `<div class="aai-page">
      <header class="aai-top">
        <button type="button" class="aai-menu" data-action="ai-menu" title="历史对话" aria-label="历史对话">${AI_GLYPH_MENU}</button>
        <strong class="aai-name">AI 咨询师</strong>
        <span class="aai-top-gap" aria-hidden="true"></span>
        <button type="button" class="aai-new" data-action="ai-new-chat" title="新对话" aria-label="新对话">${AI_GLYPH_COMPOSE}</button>
        <button type="button" class="aai-close" data-action="ai-close" title="关闭" aria-label="关闭">${icon('Close')}</button>
      </header>
      <div class="aai-thread" id="aai-thread">${appAiThreadHtml()}</div>
      ${aiKeyboardArea(ctx)}
      ${state.aiHistoryOpen?appAiDrawerHtml():''}
    </div>`;
  }
  /* 主 App「AI 咨询师」页的底部区（.aai-page 的最后一块、贴底）—— 三种形态互斥
     （2026-10-06 晚些需求：点输入框调出「当前键盘」、点图片 / 头像从底部弹出 2 行图片高度的窗口；
     上一版「键盘开启就常驻」的两分支作废）：
     ① 底部弹窗（state.aaiSheet = 'photo' | 'partner'）：**贴底**升起 —— 与调出键盘同一形态：
        面板占屏幕底、把输入行（连同缩略图行 / 快捷栏）顶到它上面（2026-10-06 晚些需求，
        由「输入行上方弹出」改成这一形态）
        （见 aiSheetHtml；高度「2 行图片」由 paintAaiSheet 实测写进 --aai-sheet-h，内部可滚）；
     ② 调出的键盘（state.aaiKb，点输入框那一下调出）：**当前键盘**是 LoveCo
        （permissions.ime = 'loveco' 且键盘已启用）时是问AI 页那一套 —— keyboardTopBar 出
        kb-free-chat（标题栏 + 输入区）+ 键区 + 平台底栏；否则是**系统键盘**（.kbsw-sys，
        与「切换到 LoveCo 键盘」页同一套系统英文键盘画法，高度 = 键区那一档）；
     ③ 其余（默认）：只有贴底的常驻输入栏（.aai-bar —— 组件在这一形态不出「问AI」标题栏，
        placeholder 固定「输入或按住说话」，见 kb-free-chat.js）。
     三种形态的输入行都是同一块 kb-free-chat，读同一份 freeText / selectedPhotos。 */
  function aiKeyboardArea(ctx) {
    const kb = state.aaiKb && !state.aaiSheet;
    const loveco = kb && state.permissions.kbEnabled && state.permissions.ime === 'loveco';
    const below = !kb ? '' : loveco
      ? `<div class="kb-body" id="kbbody">${LoveCoUI.render('kb-keys', ctx)}</div>${LoveCoUI.render('kb-navbar', ctx)}`
      : `<div class="aai-sys">${kbSwitchSystemKeyboard()}</div>`;
    return `<section class="keyboard free-chat aai-bar${kb?' aai-kb':''}" aria-label="${kb?(loveco?'LoveCo 模拟键盘':'系统键盘'):'AI 咨询师输入栏'}">
      ${keyboardTopBar(ctx)}
      ${state.aaiSheet ? aiSheetHtml(ctx) : ''}
      ${below}
    </section>`;
  }
  /* 底部弹窗（**贴底**那块「2 行图片高度」的窗口，把输入行顶上去；高度由 paintAaiSheet 实测）：
     'photo' = 截图网格 —— 复用 kb-photo-picker 的内嵌形态（state.freePicker 置真），
     读的仍是 state.selectedPhotos，选图 / 移除 / 权限两档引导都随它走；
     'partner' = 聊天对象列表（首行「不选择」—— 头像同样是默认头像插画 AV.chat，其余按当前顺序）—— 纯单选，选完即收
     （见 select-partner 动作），输入行左端头像随之更新。 */
  function aiSheetHtml(ctx) {
    if (state.aaiSheet === 'partner') {
      const current = person();
      const row = (p) => {
        const on = p ? state.selectedPartner === p.id : !current;
        return `<button type="button" class="aai-prow${on?' on':''}" data-action="select-partner:${p?esc(p.id):'none'}" aria-pressed="${on}">${p?partnerAvatar(p):noneAvatar(AV.chat||'')}<span class="aai-pname">${p?esc(p.name):'不选择'}</span>${p?`<small>${esc(p.stage)}</small>`:''}</button>`;
      };
      return `<div class="aai-sheet aai-sheet-partner${state.pickerEnter?' entering':''}" role="dialog" aria-label="选择聊天对象" id="aai-sheet">
        ${row(null)}${state.partners.map(row).join('')}
      </div>`;
    }
    return `<div class="aai-sheet aai-sheet-photo${state.pickerEnter?' entering':''}" role="group" aria-label="选择聊天截图（最多3张）" id="aai-sheet">${LoveCoUI.render('kb-photo-picker', ctx)}</div>`;
  }
  /* 主 App「AI 咨询师」页：点输入框 = 调出「当前键盘」（LoveCo / 系统键盘，见 aiKeyboardArea）。
     底部弹窗开着时这一下先收弹窗（与键盘形态「点输入框收选择器」同一条习惯），
     调出 / 收起都重渲染后把焦点交回输入框（DOM 重建会丢焦点，不交回就要点第二下才能打字）。 */
  function openAaiKeyboard() {
    if (state.aaiSheet) { state.aaiSheet=''; state.freePicker=false; }
    else if (!state.aaiKb) state.aaiKb=true;
    else return;
    render();
    $('#free-chat')?.focus({preventScroll:true});
  }
  /* 图片 / 头像两枚按钮的落点：开对应弹窗（开弹窗先收键盘）；已开着同一个时再点即收
     （同一枚按钮开 / 关）。pickerEnter 只让这一次渲染带从下往上的弹出动画。 */
  function openAaiSheet(kind) {
    state.aaiSheet=kind; state.aaiKb=false; state.freePicker = kind==='photo';
    state.pickerEnter=true; render(); state.pickerEnter=false;
  }
  function toggleAaiSheet(kind) {
    if (state.aaiSheet === kind) { state.aaiSheet=''; state.freePicker=false; render(); return; }
    openAaiSheet(kind);
  }
  /* 收起这一页的键盘与底部弹窗（点聊天记录区 / Esc 同一出口）—— 返回是否真的收了 */
  function closeAaiLayers() {
    if (!state.aaiKb && !state.aaiSheet) return false;
    state.aaiKb=false; state.aaiSheet=''; state.freePicker=false;
    return true;
  }
  /* 底部弹窗「2 行图片高度」的实测（渲染后调用，见 renderApp 尾部）：与 .shot-card 的
     3 列 / 3:4 网格一致 —— 从窗口实际宽度反推一行卡片高（内容宽减两条列间距后三等分、乘 4/3），
     取两行 + 行间距 + 上下内边距写进 --aai-sheet-h（图片网格与对象列表两个弹窗共用这个高度；
     窄屏卡片变小、窗口跟着矮）。不在这一页 / 没开弹窗时把变量清掉，免得留在下一次。 */
  function paintAaiSheet() {
    const page = $('.aai-page');
    if (!page) return;
    const sheet = $('.aai-sheet');
    if (!sheet) { page.style.removeProperty('--aai-sheet-h'); return; }
    const padEl = sheet.querySelector('.free-picker') || sheet;
    const pbox = getComputedStyle(padEl);
    const padX = (parseFloat(pbox.paddingLeft) || 0) + (parseFloat(pbox.paddingRight) || 0);
    const padY = (parseFloat(pbox.paddingTop) || 0) + (parseFloat(pbox.paddingBottom) || 0);
    const grid = sheet.querySelector('.picker-grid');
    const gap = grid ? (parseFloat(getComputedStyle(grid).columnGap) || 10) : 10;
    const cardW = (sheet.clientWidth - padX - gap * 2) / 3;
    page.style.setProperty('--aai-sheet-h', `${Math.round(cardW * 4 / 3 * 2 + gap + padY)}px`);
  }
  /* 聊天记录的一条消息：用户 = 截图卡（shot() 现画，与键盘选图同源）+ 可选文字气泡，都靠右；
     AI = 浅灰大卡，pending 时是「正在输入」三点气泡，完成后内容走 mdHtml 排版。 */
  function appAiThreadHtml() {
    const th = appAiThread();
    /* 空会话的引导文案：键盘不再常驻（点输入框才调出），两态并成一态 */
    if (!th.msgs.length) return `<div class="aai-empty"><p>新的对话</p><small>点下面的输入框调出键盘提问，或附一张聊天截图，AI 咨询师随时在。</small></div>`;
    return th.msgs.map(m => {
      if (m.role === 'user') {
        const shots = (m.photos || []).map(id => {
          const item = photoItems().find(s => s.id === id);
          return item ? `<span class="aai-shot">${shot(item)}</span>` : '';
        }).join('');
        const text = m.text ? `<div class="aai-user-text">${esc(m.text)}</div>` : '';
        return `<div class="aai-msg is-user">${shots}${text}</div>`;
      }
      if (m.pending) return `<div class="aai-msg is-ai"><div class="aai-bubble aai-typing" role="status" aria-label="AI 正在输入"><i></i><i></i><i></i></div></div>`;
      return `<div class="aai-msg is-ai"><div class="aai-bubble aai-md">${mdHtml(m.md || '')}</div></div>`;
    }).join('');
  }
  function appAiThread() {
    return state.aiThreads.find(t => t.id === state.aiThread) || state.aiThreads[0] || { id:'', title:'新对话', msgs:[] };
  }
  /* 内置演示会话（首次进页摆上，照设计截图那一轮）：AI 早前的一轮建议（结尾带那句追问）
     → 用户把一张聊天截图发进来（相册样例 s1「与林间的聊天」）→ AI 的「对话解读 + 三个版本」
     长回复。另有两条历史空会话，让抽屉列表与设计截图一致（三条「新对话」，当前一条高亮）。 */
  function seedAppAi() {
    const demo = { id:`t${++state.aiSeq}`, title:'新对话', msgs:[
      { role:'ai', md:[
        '## 对话解读',
        '她问「你平时什么时候休息」，多半是在看你们的时间能不能对上。别急着报日程，先把话题接住，再带一个具体的计划，她会更容易接。',
        '',
        '## 版本1（先接住，再留钩子）',
        '周中休息，正好错开人满为患的周末。最近想去看一家新开的展，回头可以交流下攻略。',
        '',
        '## 版本2（轻松一点）',
        '周中休息的好处是哪儿都不挤，坏处是没人陪我闲着 —— 你呢？',
        '',
        '要不要我再写个更简短的版本？'
      ].join('\n') },
      { role:'user', photos:['s1'] },
      { role:'ai', md:[
        '## 对话解读',
        '她表达了独自出行久了，会觉得有点乏味，你们找到了共同经历，情绪是共鸣感，不用急着推进，保持对等松弛，带一点钩子。',
        '',
        '## 版本1（共鸣感强，带轻张力，推荐）',
        '一个人去也挺自在的，不过有些风景，两个人看会更有意思。下次我组队，你考虑一下？',
        '',
        '## 版本2（轻松幽默，留话题）',
        '看来我们都算「独行侠」—— 要不要比比谁去过的地方更冷门？',
        '',
        '## 版本3（稳妥推进，不施压）',
        '我也经常一个人去看电影，挺享受的。你要是哪天想找人拼场，可以叫上我。',
        '',
        '要不要我再写个更简短的版本？'
      ].join('\n') }
    ] };
    state.aiThreads = [
      { id:`t${++state.aiSeq}`, title:'新对话', msgs:[] },
      { id:`t${++state.aiSeq}`, title:'新对话', msgs:[] },
      demo
    ];
    state.aiThread = demo.id;
  }
  function openAppAi() {
    if (!state.aiThreads.length) seedAppAi();
    abortVoiceHold();dismissKbEditor();
    state.freeChat=true;state.freePicker=false;
    /* 与 openFreeChat 同一套清场：进页就是干净的「问AI」输入行 + 字母层键区 */
    state.typing=false;state.composition='';state.t9Path=0;state.layer='letters';
    state.freeCaret=state.freeText.length;
    state.aiHistoryOpen=false;
    openAppScreen('app-ai');
    /* 聊天页惯例：进页落最底部（最新一条消息可见；内置演示会话因此从最后一轮看起） */
    scrollAppAiThread();
  }
  /* 新对话（顶栏的编辑按钮 / 抽屉里的「⊕ 新对话」同一入口）：立刻开一条空会话并置为当前，
     旧会话原样留在列表里，抽屉顺手收起。输入草稿（freeText）不动 —— 那是键盘输入行的内容，
     与键盘形态「收起的是页面、不是用户打的字」同一口径。 */
  function appAiNew() {
    const t = { id:`t${++state.aiSeq}`, title:'新对话', msgs:[] };
    state.aiThreads.push(t);
    state.aiThread = t.id;
    state.aiHistoryOpen = false;
    render(); scrollAppAiThread();
  }
  /* 抽屉里点某条历史会话：切过去并收抽屉 */
  function appAiOpen(id) {
    if (state.aiThreads.some(t => t.id === id)) state.aiThread = id;
    state.aiHistoryOpen = false;
    render(); scrollAppAiThread();
  }
  /* 主 App 侧的发送（sendFreeChat 的主 App 分流，见其函数头）：未登录先被 needLogin 拦到
     「手机号登录」页（与键盘 AI 链路同一道门槛）；结果结构与键盘同一套 —— 带截图或快捷栏
     点了「帮我回」= 聊天分析那条（对话解读 + 三个版本），其余 = AI通用回复。
     仿真节奏：先出「正在输入」三点气泡，约 1.1s 后接上 AI 回复（aiBusy 挡住连发）。 */
  function appAiSend() {
    const text=state.freeText.trim();
    const photos=state.selectedPhotos.map(id=>photoItems().find(s=>s.id===id)).filter(Boolean);
    if(!text&&!photos.length)return;
    if(state.aiBusy)return;
    if(needLogin())return;
    const kind=(state.freeShortcut==='reply'||photos.length)?'chat':'review';
    const th=appAiThread();
    th.msgs.push({role:'user', text, photos:photos.map(p=>p.id)});
    /* 发送后收掉底部弹窗（图片网格 / 对象列表），输入行与调出的键盘留在原位（继续对话） */
    state.freeText='';state.freeCaret=0;state.freePicker=false;state.freeShortcut='';state.aaiSheet='';
    state.selectedPhotos=[];
    th.msgs.push({role:'ai', pending:true});
    state.aiBusy=true;
    render(); scrollAppAiThread();
    const reply=appAiReply(kind);
    setTimeout(()=>{
      state.aiBusy=false;
      const last=appAiThread().msgs.at(-1);
      if(last&&last.pending){last.pending=false;last.md=reply;}
      render(); scrollAppAiThread();
    },1100);
  }
  /* AI 回复的文案：沿用键盘同一份仿真内容（makeBrief / makeIdeas / REVIEW_ANSWER·THINKING）。
     chat = 设计截图那一版 ——「对话解读」+ 三个版本（小节名取 makeIdeas 策略标题里「]」到
     「：」之间那截，如「体面收尾」）+ 结尾追问；review = AI通用回复的三节 markdown。 */
  function appAiReply(kind) {
    const tail='要不要我再写个更简短的版本？';
    if(kind!=='chat')return `${REVIEW_ANSWER}\n\n---\n\n${REVIEW_THINKING}\n\n${tail}`;
    const brief=makeBrief();
    const versions=makeIdeas().map((it,i)=>{
      const label=(it.title.split(']')[1]||it.title).split('：')[0].trim()||`版本${i+1}`;
      return `## 版本${i+1}（${label}）\n${it.reply}`;
    });
    return ['## 对话解读', brief.text, '', versions.join('\n\n'), '', tail].join('\n\n');
  }
  /* 聊天记录贴底：新消息 / 切换会话 / 新对话后把滚动容器推到底（真机聊天页同款行为） */
  function scrollAppAiThread() {
    requestAnimationFrame(()=>{ const el=$('#aai-thread'); if(el)el.scrollTop=el.scrollHeight; });
  }
  /* 历史抽屉（点顶部汉堡弹出，照设计截图 3）：左侧白色面板（约 78% 宽）盖住整页（含键盘），
     右侧留一层透明点击层（点了收抽屉 —— 设计图上被盖住的页面不压暗）。面板自上而下：
     标题行「对话」+ 右端收起箭头；「⊕ 新对话」一行（开新会话并收抽屉）；分隔线；
     会话列表（气泡图标 + 会话名「新对话」，当前会话整行浅蓝底、图标转蓝）。 */
  function appAiDrawerHtml() {
    const th=appAiThread();
    return `<div class="aai-drawer">
      <button type="button" class="aai-drawer-scrim" data-action="ai-drawer-close" aria-label="关闭历史对话"></button>
      <aside class="aai-side" role="dialog" aria-label="历史对话">
        <header class="aai-side-head">
          <strong>对话</strong>
          <button type="button" class="aai-side-back" data-action="ai-drawer-close" title="收起" aria-label="收起历史对话">${icon('ArrowLeft')}</button>
        </header>
        <button type="button" class="aai-side-new" data-action="ai-new-chat"><span class="aai-side-plus" aria-hidden="true">${icon('Plus')}</span>新对话</button>
        <div class="aai-side-list">${state.aiThreads.map(t=>`<button type="button" class="aai-side-item${t.id===th.id?' on':''}" data-action="ai-thread:${esc(t.id)}" aria-current="${t.id===th.id}"><span class="aai-side-ic" aria-hidden="true">${icon('ChatDotRound')}</span><span class="aai-side-name">${esc(t.title)}</span></button>`).join('')}</div>
      </aside>
    </div>`;
  }
  /* —— 开启键盘引导流程（appScreen='kb-guide'，kbGuidePage 三态）——
     进入主 App 时键盘未开启（permissions.kbEnabled=false）就走这条流程。
     引导页三端**大致相同、各有差异**（见 README「需求记录」）：模拟设置页 2026-09-28 起
     按端分叉（iOS 走 appGuideSettingsIos 这一版「LoveCo 键盘」页，鸿蒙 / 安卓仍走
     appGuideSettings），详情页三端暂时共用；中央的演示动画按平台取 —— 三端各有一支
     设计给的录屏（安卓版 2026-09-28 补入，此前回落到鸿蒙那支）。
     同一支视频在引导页中央大卡里循环播；设置页 / 详情页左下角的悬浮窗（画中画）里
     **只播一次、不循环**（2026-09-28 需求，播完停在末帧）。 */
  const GUIDE_VIDEOS = {
    harmony: 'assets/Enable LoveCo Keyboard HarmonyOS.mp4',
    ios: 'assets/Enable LoveCo Keyboard IOS.mp4',
    android: 'assets/Enable LoveCo Keyboard Andriod.mp4',
    /* 「切换到 LoveCo 键盘」页（iOS / 鸿蒙引导第二步）自己的素材（2026-09-29 补入）：
       演的是「长按地球 → 选择器里切到 LoveCo」那一下，见 appGuideSwitch */
    switch: 'assets/Switch To LoveCo Keyboard.mp4'
  };
  function guideVideo() { return GUIDE_VIDEOS[state.platform] || GUIDE_VIDEOS.harmony; }
  /* 引导第二步（「切换到LoveCo输入法」）**不放演示动画**（2026-09-28 需求：第二步去掉视频框）——
     原先「留空占位」的第二段视频卡（`GUIDE_VIDEOS2` / `guideVideo2()` / `.kb-guide-video-empty`）
     连卡下那句说明一并删除；第二步的操作提示改由**键盘切换悬浮窗**的弹框给（见 ieSwitchSheet）。 */
  /* 演示动画**带声音**播（素材自带音轨：立体声 44.1kHz，见 README 文件结构）。
     但浏览器不允许「有声音的自动播放」—— 标签上直接去掉 muted 的话画面根本不播（更糟），
     所以 video 标签仍是 autoplay muted：先按静音起播保证画面在动，拿到用户手势后再摘掉静音。
     手势不用特意去点视频：页面上点过任何一处（页面列表、按钮、左栏开关…）就算数
     （Chrome 等按 navigator.userActivation.hasBeenActive 判定「与这个域名交互过」）；
     全程没被点过（例如直接开带 screen=kb-guide 的链接）就先静音播，等首次点击 / 按键补上
     （guideSoundArmed 只挂一次全局监听）。被浏览器拦住时 unmuteGuideVideos 会自动退回静音。
     innerHTML 重建会把 video 节点整个换掉，所以每次 renderApp 后都要重新接一遍。 */
  let guideSoundArmed = false;
  function guideVideoNodes() { return [...document.querySelectorAll('.kb-guide-video-card video, .kbsw-video-card video, .hz-pip video')]; }
  /* 「键盘使用引导（演示）」层（.kb-usage-guide）是盖满整机的覆盖层（styles.css：position:absolute;
     inset:0; z-index:25）—— 它开着时，底下那页若带演示视频（引导页大卡 / 「切换到 LoveCo 键盘」页
     大卡 / 设置页画中画），画面被盖住看不见，可 video 是 autoplay 起播、拿到手势解锁声音后一直播着，
     于是只剩声音从后台漏出来（2026-09-29 需求：从「切换到 LoveCo 键盘」页选完 LoveCo 进演示层，
     后台还在放视频声）。这类**被盖住的**节点一律挑出来：暂停，且不参与「开声音」那套处理。 */
  function coveredGuideVideos() {
    if (!state.kbGuideDemo) return [];
    return guideVideoNodes().filter(v => !v.closest('.kb-usage-guide'));
  }
  function unmuteGuideVideos() {
    const covered = coveredGuideVideos();
    covered.forEach(v => v.pause());
    guideVideoNodes().forEach(v => {
      if (covered.includes(v)) return;
      if (!v.muted) { v.play().catch(() => {}); return; }
      v.muted = false;
      /* 仍被拦（没有用户手势）：退回静音接着播，别把画面停住 */
      v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
    });
  }
  /* 「问题反馈」页（appFeedbackPage）两个输入框的接线：输入即时回存 state 里的草稿
     （换问题类型会整页重渲染，草稿在 state 里才不会丢），并把右下角计数就地改成
     「已输入字数 / 上限」。计数只改文本、不重渲染 —— 焦点与光标不跳；上限由控件的
     maxlength 兜住（1000 / 200）。 */
  function bindFeedbackPage() {
    [['#feedback-text','#feedback-text-count',1000,'feedbackText'],
     ['#feedback-contact','#feedback-contact-count',200,'feedbackContact']].forEach(([sel,countSel,max,key])=>{
      const node=$(sel), count=$(countSel);
      if(!node||!count)return;
      node.addEventListener('input',()=>{
        state[key]=node.value;
        count.textContent=`${node.value.length}/${max}`;
      });
    });
  }
  function wireGuideVideos() {
    if (!guideVideoNodes().length) return;
    /* 被演示层盖住的那页视频：渲染完先停住（innerHTML 重建会把 video 整个换新、autoplay 又起播，
       所以每次渲染后都要重做一遍；露在外面的照旧播 + 试着开声音） */
    coveredGuideVideos().forEach(v => v.pause());
    /* 拿不到 userActivation（老浏览器）时当作「已交互」直接试一次，被拦会自动退回静音 */
    if (navigator.userActivation ? navigator.userActivation.hasBeenActive : true) unmuteGuideVideos();
    if (guideSoundArmed) return;
    guideSoundArmed = true;
    ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, unmuteGuideVideos, { once: true, capture: true }));
  }
  /* 安卓两步引导的状态（appGuideHome 的两颗按钮共用）：
     step1 = 第一步「启用LoveCo输入法」还可点（键盘未启用）；step2 = 第二步「切换到LoveCo输入法」
     还可点（安卓专属：键盘已启用、但系统当前输入法还不是 LoveCo）。为 false 的那一颗置灰、
     不可点、不呼吸（theme.css 的 .kb-guide-btn:disabled），两颗同时为 false 即两步都完成。 */
  function guideStepState() {
    const android = state.platform === 'android';
    const enabled = state.permissions.kbEnabled;
    return { android, step1:!enabled, step2:android && enabled && state.permissions.ime !== 'loveco' };
  }
  /* 引导完成的条件（2026-09-28 起三端统一）：**键盘已启用 + 当前键盘已切到 LoveCo**。
     第二步的落点按端分叉：安卓在引导页上弹「键盘切换悬浮窗」（pickGuideIme）、
     iOS / 鸿蒙落到整页的「切换到 LoveCo 键盘」（kbGuidePage='switch'，见 appGuideSwitch）
     —— 在那儿长按地球选完 LoveCo；两端选完都**不「当场完成」**，而是接着走引导的后半段
     （先补状态检查链后两环 → 资料引导 → 最后才是「键盘使用引导（演示）」，演示收场才完成引导，
     2026-10-08 需求，见 guideAfterSwitch）。
     消费方（都是「回到 App 那一刻」的重新校验）：设置页左上角返回箭头（guideBack）、
     悬浮窗「返回 App」（guidePipBack）、键盘切换悬浮窗里选完输入法（pickGuideIme）——
     这三处命中条件都接 guideAfterSwitch（原「完成」胶囊 kb-switch-done 已随「已切到 LoveCo」
     形态于 2026-09-29 一并删除）；
     另有左栏两个仿真开关（「当前输入法」「开启键盘」）的收尾（见 finishGuideIfDone）。
     模拟设置页 / 详情页里的开关操作**不**消费它（2026-09-28 需求）：那两页是模拟的系统页面，
     主 App 感知不到权限变化 —— 只改设备状态，不完成引导（见 toggleGuideEnable / guideBack）。 */
  function guideSatisfied() {
    return state.permissions.kbEnabled && state.permissions.ime === 'loveco';
  }
  /* —— 引导第二步完成之后的一段（2026-10-08 需求：把「键盘使用引导（演示）」挪到最后）——
     在系统里把当前键盘切成 LoveCo 之后**不再当场开演演示**，先按序补完剩下的几站：
     ① 完全访问权限（iOS / 鸿蒙未开时弹引导层，安卓默认有）→ ② 登录（未登录进主 App 登录页）
     → ③ 资料引导（性别 / 出生日期，见 startOnboarding）→ ④ 最后才是「键盘使用引导（演示）」
     （openKbUsageGuide(true)）—— 演示收场（Esc / 「去使用」）才算引导完成：落首页 + 补跑后两环 +
     等 1 秒弹会员购买页（见 closeKbUsageGuide / finishGuide）。
     所有「第二步完成」的收尾都走 guideAfterSwitch：iOS / 鸿蒙页内选择器选完 LoveCo（pickKbSwitch）、
     安卓键盘切换悬浮窗选完（pickGuideIme）、系统设置里把默认输入法切成 LoveCo 后「回到 App」
     （guideBack / guidePipBack）、左栏仿真开关把两步摆齐（finishGuideIfDone）。
     中间几站的收尾各自续跑 guideToDemo：完全访问层的「去开启」（grantKbFullAccess）、
     登录收尾（finishKbLogin）、资料引导收尾（finishOnboarding）—— 靠 state.guideDemoPending 认路；
     登录页 X / Esc 退出（closeAppLogin）与其它「离开这次引导」的出口会把这个标记清掉。 */
  function guideAfterSwitch() {
    state.guideDemoPending = true;
    return guideToDemo();
  }
  /* 演示之前的剩下几站（幂等：从任意一站被续跑，都会按当前状态补齐还没走的那几步） */
  function guideToDemo() {
    if(checkKbFullAccess())return;                     /* 弹完全访问层，它的「去开启」续跑本函数 */
    if(!state.loggedIn){openAppLogin();return;}        /* 未登录 → 主 App 登录页（收尾续跑） */
    if(!state.genderSet||state.firstLaunch){startOnboarding();return;}  /* 资料引导（收尾续跑） */
    openKbUsageGuide(true);                            /* 都齐了 → 开演演示（收场即完成引导） */
  }
  /* 引导流程中若条件已满足就接着走后半段（第二步完成 → 登录 → 资料引导 → 演示）—— 各动作收尾统一走它：
     满足则已渲染并返回 true（调用方直接 return）；不满足返回 false，调用方继续自己的 render。
     2026-09-28 起只有左栏两个仿真开关（「当前输入法」「开启键盘」）还走它 —— 系统设置三页
     （引导页 / 设置页 / 详情页）里的动作走「回到 App」那一刻的显式校验（见 guideBack）。 */
  function finishGuideIfDone() {
    if(state.appView !== 'app' || state.appScreen !== 'kb-guide' || !guideSatisfied()) return false;
    guideAfterSwitch();
    return true;
  }
  function appKbGuideScreen() {
    /* 两页模拟系统设置都按端分叉（2026-09-28）：iOS 是「LoveCo 键盘」那一套（设置页按 App 分组
       appGuideSettingsIos / 键盘权限页 appGuideDetailIos）；安卓的设置页是小米风格浅色「设置」页
       （appGuideSettingsAndroid，2026-09-28 按设计截图补入），详情页仍与鸿蒙共用；鸿蒙走
       「输入法」那一套（appGuideSettings / appGuideDetail）—— 各版的页名、开关名与开关样式
       都不同（iOS「允许完全访问」绿开关 / 鸿蒙「完整体验模式」蓝开关 / 安卓列表开关即启用）。
       第三步「切换到 LoveCo 键盘」（kbGuidePage='switch'）iOS / 鸿蒙共用同一套渲染
       （见 appGuideSwitch）—— 安卓的第二步是键盘切换悬浮窗，不走这一页。 */
    if(state.kbGuidePage==='settings')return state.platform==='ios' ? appGuideSettingsIos() : state.platform==='android' ? appGuideSettingsAndroid() : appGuideSettings();
    if(state.kbGuidePage==='detail')return state.platform==='ios' ? appGuideDetailIos() : appGuideDetail();
    if(state.kbGuidePage==='switch')return appGuideSwitch();
    return appGuideHome();
  }
  /* 引导页（紫蓝底整页，元素**整体上下居中**，见 theme.css 的 .kb-guide-page）：
     中央白圆角大卡循环播演示视频 + 卡下一行说明 + 黑胶囊主按钮（**持续放大缩小、一闪一闪**
     地引导点击，动画见 theme.css 的 kg-breathe）—— 点它进模拟设置页。
     按钮布局**按平台分叉**（2026-09-27 起）：
     - 鸿蒙 / iOS 一颗：「启用LoveCo输入法」—— 系统侧启用只是**第一步**，
       第二步不在这一页：走「从系统设置返回 App」（打开「启用LoveCo」后点左下角悬浮窗，
       或点设置页左上角返回箭头）时若键盘已启用，就落到**整页的「切换到 LoveCo 键盘」**
       （kbGuidePage='switch'，见 appGuideSwitch）—— 那儿长按地球切到 LoveCo 后**先补状态检查链
       后两环、再走资料引导，最后才开演「键盘使用引导（演示）」**，演示收场才算引导完成
       （2026-10-08 需求把演示挪到链路最后；见 guidePipBack / guideBack / pickKbSwitch /
       guideAfterSwitch / closeKbUsageGuide）；
     - **安卓两步**：安卓系统不允许 App 直接切换输入法，键盘启用后还要用户在系统里把当前输入法
       切成 LoveCo，所以下面多挂一颗「第二步 切换到LoveCo输入法」（同样的黑胶囊）。
       两颗按钮的可用 / 呼吸状态由「第一步」「第二步」完成情况决定（见 guideStepState）：
       ① 键盘未启用 → 第一步呼吸可点（进模拟设置页启用键盘），第二步**置灰、不可点、不跳**；
       ② 键盘已启用、当前输入法还是系统默认 → 第一步**置灰、不可点、不跳**，第二步呼吸可点 ——
          这一页同时**收起演示卡与卡下说明**（2026-09-28 需求：第二步不展示视频），
          点第二步弹出**键盘切换悬浮窗**（ieSwitchSheet —— 这一步的操作提示写在那一层的弹框里）；
       ③ 两步都完成 → 引导页没有可做的了 —— 切输入法那一步在键盘切换悬浮窗里选完 LoveCo 时
          接着走引导的后半段（先补状态检查链后两环 → 资料引导 → 最后才是「键盘使用引导（演示）」，
          2026-10-08 需求把演示挪到链路最后，见 pickGuideIme / guideAfterSwitch），演示收场才
          完成引导回首页；左栏仿真开关把两步摆齐则同样接这一段（见 finishGuideIfDone）。
     注意（2026-09-28 需求）：模拟设置页 / 详情页里的操作不会让主 App 感知 —— 从那里「回到 App」
     那一刻（设置页左上角返回箭头 / 左下角悬浮窗）才重新校验：条件齐了就接着走引导的后半段
     （见 guideAfterSwitch），
     没齐才退回引导页、按钮按当前状态置灰（例如键盘已启用就是灰的）；
     **退回引导页那一刻会按当前键盘状态切到第二步**（键盘已启用 → 收起演示卡与说明 + 自动弹出
     键盘切换悬浮窗，见 guideBack）—— 真实设备上 App 也只能在自己回到前台时才知道键盘开了。
     三端各有一条页面列表条目（kb-guide / kb-guide-android / kb-guide-ios），形态**大致相同**、
     演示动画素材按平台取（三端各一支，安卓版 2026-09-28 补入，见 GUIDE_VIDEOS）。 */
  function appGuideHome() {
    const { android, step1, step2 } = guideStepState();
    /* 安卓的第二步阶段（键盘已启用）**不放演示卡、也不放卡下说明**（2026-09-28 需求：
       去掉视频框 —— 第二步的操作提示改由键盘切换悬浮窗的弹框给，见 ieSwitchSheet）；
       其余形态照旧：卡内循环播当前平台的演示动画 + 一行说明「在「输入法」管理中，启用LoveCo输入法」 */
    const second = android && !step1;
    const card = `<div class="kb-guide-video-card"><video src="${guideVideo()}" autoplay muted loop playsinline></video></div>`;
    return `<div class="kb-guide-page">
      ${second?'':card}
      ${second?'':'<p class="kb-guide-caption">在「输入法」管理中，启用LoveCo输入法</p>'}
      <button class="kb-guide-btn primary" data-action="kb-guide-settings"${step1?'':' disabled'}><span>${android?'第一步 ':''}启用LoveCo输入法</span><i aria-hidden="true">${icon('ArrowRight')}</i></button>
      ${android?`<button class="kb-guide-btn primary" data-action="kb-guide-switch"${step2?'':' disabled'}><span>第二步 切换到LoveCo输入法</span><i aria-hidden="true">${icon('ArrowRight')}</i></button>`:''}
    </div>`;
  }
  /* 悬浮窗（模拟设置页 / 详情页左下角的画中画）：同一支视频缩成小窗，**只播一次、不循环**
     （2026-09-28 需求：循环播放会一直动，小窗改成播完停在末帧；引导页中央大卡仍是循环播）；
     「启用LoveCo」打开后浮现绿色对勾与「完成后返回LoveCo App」小字 —— 点它 = 从系统设置
     **返回 LoveCo App**：App 侧重新校验一遍权限，已开启就关闭引导页（见 guidePipBack）。
     它与设置页左上角的返回箭头（guideBack）是同一处「回到 App」校验 —— 主 App 只在回到
     App 这一刻感知；原左栏「模拟 › 返回主 App」按钮也走这条校验，2026-09-28 已按需求删除。 */
  function guidePip() {
    const done = state.permissions.kbEnabled;
    return `<button class="hz-pip${done?' done':''}" data-action="kb-guide-pip" ${done?'':'aria-hidden="true" tabindex="-1"'}>
      <video src="${guideVideo()}" autoplay muted playsinline aria-hidden="true"></video>
      ${done?`<span class="hz-pip-check" aria-hidden="true">${icon('Check')}</span><span class="hz-pip-caption">完成后返回LoveCo App</span>`:''}
    </button>`;
  }
  /* 键盘切换悬浮窗（ieSwitchSheet，2026-09-28 按设计截图补入；只有安卓引导流程会开它，见 state.kbImeSwitch）：
     仿真「点键盘上的切换输入法按钮」弹出的系统输入法选择器 —— 白色底部抽屉（圆角顶、浅紫选中行，
     见 theme.css 的 .ie-*），自上而下：**顶部一行提示**（「选择 LoveCo 输入法」—— 2026-09-28 需求：
     引导第二步不再放演示视频框，原来印在卡片下方的那句说明挪进这一层的弹框里，见 appGuideHome）
     + 按输入法分组（灰字组名 + 该输入法的语言行）。
     **只列两个输入法**：LoveCo（`assets/brand/…` 那支自家输入法）与**讯飞输入法**（模拟设置页
     「官方输入法」分组里的那颗；设计截图里它写作「讯飞输入法小米版」，这里的行名与设置页统一）；
     设计截图里第三组「👉 Lovekey键盘」按需求**去掉**（「这里仅保留 LoveCo 和 讯飞输入法」）。
     当前输入法（permissions.ime）那一行铺淡紫底 + 右侧对勾 —— 截图里选中的正是 LoveCo。
     点行即切换当前输入法并收起本层（kb-guide-ime-pick）；点抽屉外的遮罩（.ie-scrim，与抽屉是
     兄弟节点、不是父子 —— 所有 [data-action] 各自挂监听，嵌套会连带触发外层动作）收起本层。
     它由两个时机打开：引导页第二步按钮（openImeSwitch）、从模拟设置页退回引导页且键盘已启用
     （guideBack）。 */
  function ieSwitchSheet() {
    const loveco = state.permissions.ime === 'loveco';
    const row = (on, label, value) => `<button class="ie-row${on?' on':''}" data-action="kb-guide-ime-pick:${value}"><span>${label}</span>${on?`<i class="ie-check" aria-hidden="true">${icon('Check')}</i>`:''}</button>`;
    return `<div class="ie-layer">
      <div class="ie-scrim" data-action="kb-guide-ime-close" aria-hidden="true"></div>
      <div class="ie-sheet" role="dialog" aria-modal="true" aria-label="切换输入法">
        <p class="ie-hint">选择 LoveCo 输入法</p>
        <p class="ie-group">LoveCo</p>
        ${row(loveco,'中文（中国）','loveco')}
        <div class="ie-sep" aria-hidden="true"></div>
        <p class="ie-group">讯飞输入法</p>
        ${row(!loveco,'中文（中国）','system')}
      </div>
    </div>`;
  }
  /* —— 「切换到 LoveCo 键盘」页（kbGuidePage='switch'，2026-09-28 按设计截图补入）——
     iOS / 鸿蒙引导的**第二步**（安卓的第二步是键盘切换悬浮窗，不走这一页；两端的渲染**共用这一份**）。
     整页蓝底（#5B68F5 —— 与引导第一步同一块紫蓝，2026-09-29 需求：原白底改成蓝色；
     状态栏一起转蓝白字，见 theme.css 的 .guide-blue），自上而下三段：
     ① **循环播放的演示动画**（素材 2026-09-29 补入，演「长按地球 → 选择器切到 LoveCo」那一下）；
     ② **LoveCo 页面的输入框**（进来就是**激活态**：渲染后由 renderApp 把焦点交给它，
        光标在框里闪、不用先点一下；点页面上任何一处也会把焦点还回来，见 bindKbSwitchPage）；
     ③ **当前正在使用的键盘**（高 = --lc-keyboard-height，与真实键盘同高，切换键盘时页面不跳）：
        固定是**系统英文键盘**（1:1 照设计图用 CSS 画，见 kbSwitchSystemKeyboard）——
        这一页只演「切换前」那一刻，「已切到 LoveCo」形态（LoveCo 键盘预览 + 完成胶囊）
        已按 2026-09-29 需求删除。
     地球按钮**长按（350ms）**弹出键盘选择器（kbSwitchPickerSheet）—— 短按也给同一个出口（宽容处理）；
     在里面选 LoveCo 即第二步达成：**不就地换形态**，接着走引导的后半段（2026-10-08 需求：
     先补状态检查链后两环 → 资料引导 → 最后才是「键盘使用引导（演示）」，演示收场才完成引导：
     落首页 + 等 1 秒弹会员购买页，见 pickKbSwitch / guideAfterSwitch）。
     状态：permissions.ime 记「当前这一刻用的是哪套键盘」（与左栏「当前输入法」是同一个开关），
     kbSwitchPicker 记选择器开着。 */
  function appGuideSwitch() {
    return `<div class="kbsw-page">
      <div class="kbsw-video" aria-label="演示视频（循环播放）">
        <div class="kbsw-video-card"><video src="${GUIDE_VIDEOS.switch}" autoplay muted loop playsinline></video></div>
      </div>
      <div class="kbsw-input-row">
        <input id="kb-switch-input" class="kbsw-input" type="text" placeholder="输入消息…" autocomplete="off" spellcheck="false" aria-label="LoveCo 页面的输入框">
      </div>
      <div class="kbsw-kb">${kbSwitchSystemKeyboard()}</div>
      ${state.kbSwitchPicker ? kbSwitchPickerSheet() : ''}
    </div>`;
  }
  /* 系统英文键盘（设计截图 1:1）：候选词行（i / the / i'm）+ qwerty 三排（第二排左右内缩、
     第三排首尾是 ⇧ / ⌫）+ 「123 / space / done」（done 蓝底白字）+ 底行「地球 + 提示气泡 + 麦克风」。
     键位是纯外观（span，不接输入法逻辑）—— 这一页演示的是「长按地球切键盘」，不是打字；
     只有地球是可交互的（长按弹键盘选择器，见 bindKbSwitchPage，节点上不挂 data-action）。 */
  function kbSwitchSystemKeyboard() {
    const glyph = window.LoveCoSystemGlyphs;
    const keys = (row) => [...row].map(c => `<span class="kbsw-key">${c}</span>`).join('');
    return `<div class="kbsw-sys">
      <div class="kbsw-suggest" aria-hidden="true"><span>i</span><span>the</span><span>i'm</span></div>
      <div class="kbsw-row">${keys('qwertyuiop')}</div>
      <div class="kbsw-row kbsw-inset">${keys('asdfghjkl')}</div>
      <div class="kbsw-row"><span class="kbsw-key kbsw-func">${icon('ArrowUp')}</span>${keys('zxcvbnm')}<span class="kbsw-key kbsw-func">${icon('Back')}</span></div>
      <div class="kbsw-row"><span class="kbsw-key kbsw-func kbsw-num">123</span><span class="kbsw-key kbsw-space">space</span><span class="kbsw-key kbsw-go">done</span></div>
      <div class="kbsw-row kbsw-bottom">
        <button class="kbsw-globe" title="长按切换键盘" aria-label="长按切换键盘">${glyph.globe}</button>
        <span class="kbsw-hint">长按 <i aria-hidden="true">${glyph.globe}</i> 切换到LoveCo键盘</span>
        <span class="kbsw-mic" aria-hidden="true">${glyph.voice}</span>
      </div>
    </div>`;
  }
  /* 键盘选择器（长按地球弹出的那一张，设计截图 2）：白色圆角面板贴在键盘左上方、
     带一层整页半透明遮罩，从下往上弹出。自上而下：「更多键盘设置…」/ 分隔线 /
     两个键盘行（当前这一套右侧打勾）。设计截图里的「中文9键」「中文手写」按需求删除，
     只留 LoveCo，另补一行**英文键盘**（样式即第一张图的系统英文键盘）；
     面板底部按截图保留两枚装饰小图形（切换键盘 / 键盘设置），不给动作。 */
  function kbSwitchPickerSheet() {
    const glyph = window.LoveCoSystemGlyphs;
    const loveco = state.permissions.ime === 'loveco';
    const row = (label, id, on) => `<button class="kbsw-prow${on?' on':''}" data-action="kb-switch-pick:${id}" aria-pressed="${on}"><span>${label}</span>${on?`<i class="kbsw-check" aria-hidden="true">${icon('Check')}</i>`:''}</button>`;
    return `<div class="kbsw-picker-layer">
      <div class="kbsw-scrim" data-action="kb-switch-picker-close" aria-hidden="true"></div>
      <div class="kbsw-picker" role="dialog" aria-modal="true" aria-label="切换键盘">
        <button class="kbsw-prow kbsw-more" data-action="kb-switch-settings"><span>更多键盘设置…</span></button>
        <div class="kbsw-sep" aria-hidden="true"></div>
        ${row('LoveCo','loveco',loveco)}
        ${row('英文键盘','system',!loveco)}
        <div class="kbsw-picons" aria-hidden="true"><span>${glyph.globe}</span><span>${glyph.setKbd}</span></div>
      </div>
    </div>`;
  }
  /* 进入「切换到 LoveCo 键盘」这一页（引导流程的第二步、以及「更多键盘设置…」返回时都走它）：
     先收起键盘选择器，页面固定摆成「切换前」那一刻（底下是系统英文键盘）。 */
  function openKbSwitchPage() {
    state.kbImeSwitch=false;
    state.kbSwitchPicker=false;
    state.kbGuidePage='switch';
    render();
  }
  /* 长按地球（或短按）：弹出键盘选择器 */
  function openKbSwitchPicker() {
    if(state.kbSwitchPicker)return;
    state.kbSwitchPicker=true;render();
  }
  function closeKbSwitchPicker() {
    if(!state.kbSwitchPicker)return;
    state.kbSwitchPicker=false;render();
  }
  /* 在选择器里选一套键盘 = 在系统里把当前键盘切过去：落到 permissions.ime
     （与左栏「平台与app形态 › 当前输入法」同一个状态）。
     选 **LoveCo** = 引导第二步达成：不就地换形态（2026-09-29 需求：原「LoveCo 键盘预览
     + 完成胶囊」形态已删除），接着走引导的后半段（2026-10-08 需求改了顺序：先补状态检查链
     后两环 → 资料引导 → 最后才是「键盘使用引导（演示）」，演示收场才完成引导 —— guideAfterSwitch）。
     选「英文键盘」只是把状态切回系统键盘、留在本页。选 LoveCo 必然已启用键盘，顺手补一句兜底。 */
  function pickKbSwitch(id) {
    const loveco = id==='loveco';
    state.permissions.ime = loveco ? 'loveco' : 'system';
    if(loveco) state.permissions.kbEnabled = true;
    syncFullAccess();
    state.kbSwitchPicker=false;
    if(loveco) return guideAfterSwitch();
    render();
  }
  /* 「更多键盘设置…」= 去模拟系统设置页（按运行平台那一版，见 appKbGuideScreen）——
     从那儿按返回箭头退回时回到本页（guideBack 的第二步分支）。 */
  function openKbSwitchSettings() {
    state.kbSwitchPicker=false;
    state.kbGuidePage='settings';
    render();
  }
  /* 模拟鸿蒙「输入法」设置页（深色；2026-09-28 起这一版只服务鸿蒙引导 ——
     iOS 走 appGuideSettingsIos 那一套「LoveCo 键盘」页、安卓走 appGuideSettingsAndroid
     那一版小米风格浅色「设置」页，见 appKbGuideScreen 的分叉）：
     返回 + 标题、「输入法管理」小标题、
     「默认输入法」卡片（值 = 系统当前输入法，**点行即在「小艺输入法」与「LoveCo」之间切换** ——
     这是安卓引导第二步「切换到LoveCo输入法」在系统里的落点；LoveCo 还没启用时该行不可点，
     真实系统里未启用的输入法也选不了）、输入法列表卡（小艺已启用带蓝勾 / LoveCo 未启用）。
     按需求不渲染设计稿里的其它第三方输入法（除小艺外全部删掉，只留 LoveCo 一个可启用的）。
     点 LoveCo 行进它的详情页。 */
  function appGuideSettings() {
    const enabled = state.permissions.kbEnabled;
    const ime = state.permissions.ime==='loveco' ? 'LoveCo' : '小艺输入法';
    return `<div class="hz-page">
      <header class="hz-top"><button class="hz-back" data-action="kb-guide-back" aria-label="返回">${icon('ArrowLeft')}</button><h1>输入法</h1></header>
      <p class="hz-label">输入法管理</p>
      <div class="hz-card"><button class="hz-row as-button" data-action="kb-guide-ime-switch"${enabled?'':' disabled'}><span class="hz-name">默认输入法</span><span class="hz-value">${ime}<i class="hz-caret" aria-hidden="true"></i></span></button></div>
      <div class="hz-card">
        <div class="hz-row static"><span class="hz-radio on" aria-hidden="true">${icon('Check')}</span><span class="hz-name">小艺输入法</span><i class="chev" aria-hidden="true">${icon('ArrowRight')}</i></div>
        <button class="hz-row as-button" data-action="kb-guide-ime"><span class="hz-radio" aria-hidden="true"></span><span class="hz-name">LoveCo</span><span class="hz-status">${enabled?'已启用':'未启用'}</span><i class="chev" aria-hidden="true">${icon('ArrowRight')}</i></button>
      </div>
      ${guidePip()}
    </div>`;
  }
  /* 模拟安卓（小米 HyperOS 风格）系统「设置 › 输入法」页（浅色整页，2026-09-28 按设计截图补入；
     只服务安卓引导，与鸿蒙 / iOS 两版结构都不同）：顶部返回箭头 + 大标题「设置」，
     两段灰色分组标题 + 白色圆角卡片：
     ①「官方输入法」只留一行「讯飞输入法」（原「小米定制版输入法」分组改名而来，
        设计截图里的「搜狗输入法小米版」按需求删除；这一行是静态展示 —— 开关不参与任何状态）；
     ②「其他输入法」的默认项（Lovekey键盘 / 灵焰恋爱大师 / ToDesk 等）按需求全删除，
        只放一行「LoveCo 输入法」（图标 assets/brand/LoveCo_128_128.png），右侧开关**默认关** ——
        这颗开关就是 permissions.kbEnabled（与左栏「开启键盘」、详情页「启用LoveCo」同一个开关），
        打开即键盘启用、关掉即停用（当前输入法随之复位成系统默认）；**安卓没有「键盘完全访问」
        这个权限**，所以打开键盘时 permissions.keyboard 一并置开（见 syncFullAccess）。
     **本页不启动视频悬浮窗**（2026-09-28 需求）：安卓引导页跳进来后只有顶部返回箭头这一个
     出口 —— 退回引导页那一刻才校验键盘、切到第二步（见 guideBack）；
     切换当前输入法（引导第二步）的落点也不在这里，而是退回引导页后弹出的**键盘切换悬浮窗**
     （ieSwitchSheet，2026-09-28 补入）—— 本页仍只负责「启用」。 */
  function appGuideSettingsAndroid() {
    const enabled = state.permissions.kbEnabled;
    return `<div class="hz-page mi-page">
      <header class="mi-top"><button class="mi-back" data-action="kb-guide-back" aria-label="返回">${icon('ArrowLeft')}</button><h1>设置</h1></header>
      <p class="mi-label">官方输入法</p>
      <div class="mi-card">
        <div class="mi-row"><span class="mi-ic mi-ifly" aria-hidden="true">iFLY</span><span class="mi-main"><span class="mi-name">讯飞输入法</span><span class="mi-sub">中文（中国）</span></span><span class="mi-switch on is-static" aria-hidden="true"><i></i></span></div>
      </div>
      <p class="mi-label">其他输入法</p>
      <div class="mi-card">
        <div class="mi-row"><img class="mi-ic mi-app" src="assets/brand/LoveCo_128_128.png" alt=""><span class="mi-main"><span class="mi-name">LoveCo 输入法</span><span class="mi-sub">中文（中国）</span></span><button class="mi-switch${enabled?' on':''}" role="switch" aria-checked="${enabled}" aria-label="LoveCo 输入法" data-action="kb-guide-enable"><i aria-hidden="true"></i></button></div>
      </div>
    </div>`;
  }
  /* 模拟 iOS 设置页（appGuideSettingsIos）里的一行：彩色小图标 + 标签（可带一行灰色副标题）
     + 右侧灰色值 + 折角箭头；给了 action 时整行是一颗按钮 —— 本页只有「键盘」行可点。 */
  function iosSetRow({ic='',cls='',name,sub='',value='',action=''}) {
    const inner = `<span class="ios-set-ic${cls?' '+cls:''}" aria-hidden="true">${ic?window.LoveCoSystemGlyphs[ic]:''}</span>
        <span class="ios-set-main"><span class="ios-set-name">${name}</span>${sub?`<span class="ios-set-sub">${sub}</span>`:''}</span>
        ${value?`<span class="ios-set-value">${value}</span>`:''}<i class="chev" aria-hidden="true">${icon('ArrowRight')}</i>`;
    return action
      ? `<button class="ios-set-row as-button" data-action="${action}">${inner}</button>`
      : `<div class="ios-set-row">${inner}</div>`;
  }
  /* 模拟 iOS 设置里的「LoveCo 键盘」页（深色整页，2026-09-28 按设计图补入；只在 iOS 平台出现）：
     iOS 的键盘设置按 App 分组，与鸿蒙那套「输入法」列表不是一回事 —— 顶部一条导航条
     （蓝色「‹ App」返回 + 居中标题「LoveCo 键盘」），正文两组圆角卡片 + 一段灰色页脚说明。
     行里**只有「键盘」可点**（页脚说明也正是让人去点它）—— 进 LoveCo 详情页（两个开关，
     与鸿蒙链路同一个落点，见 openGuideDetail）；返回＝回引导页（纯导航，不完成引导）；
     左下角同一颗视频悬浮窗（画中画，iOS 下播 iOS 素材）= 返回 App 的出口。
     按需求：设计图里的「从其他 App 粘贴」整组不渲染；lovekey 字样一律改 LoveCo。 */
  function appGuideSettingsIos() {
    const row = iosSetRow;
    return `<div class="hz-page ios-set-page">
      <header class="ios-set-nav"><button class="ios-set-back" data-action="kb-guide-back"><i class="ios-set-chev" aria-hidden="true"></i>App</button><h1>LoveCo 键盘</h1></header>
      <p class="ios-set-label">允许“LoveCo 键盘”访问</p>
      <div class="ios-set-card">
        ${row({ic:'setPhotos',cls:'photos',name:'照片',value:'私密访问'})}
        ${row({cls:'siri',name:'Siri'})}
        ${row({ic:'setSearch',cls:'search',name:'搜索'})}
        ${row({ic:'setBell',cls:'notify',name:'通知',sub:'关'})}
        ${row({ic:'wifi',cls:'cell',name:'无线数据',sub:'无线局域网与蜂窝网络'})}
        ${row({ic:'setKbd',cls:'kbd',name:'键盘',action:'kb-guide-ime'})}
      </div>
      <p class="ios-set-label">首选语言</p>
      <div class="ios-set-card">${row({ic:'globe',cls:'lang',name:'语言',value:'简体中文'})}</div>
      <div class="ios-set-note">
        <p>“LoveCo 键盘”设置</p>
        <p>⭐️ 如果此页面没有显示「键盘」</p>
        <p class="ios-set-note-line"><i class="ios-set-num">1</i>上滑关闭设置应用后，再重新打开设置进入这个界面</p>
        <p class="ios-set-note-line"><i class="ios-set-num">2</i>进入后，点击「键盘」，打开「LoveCo」和「允许完全访问开关」</p>
        <p>由于系统限制，未打开允许完全访问时，键盘部分功能将受到影响</p>
        <p>🚫 开启完全访问权限仅用于键盘请求输出内容。</p>
        <p>我们严格遵循《隐私协议》，不会收集您的个人信息。</p>
      </div>
      ${guidePip()}
    </div>`;
  }
  /* LoveCo 输入法详情页（深色）：「启用LoveCo」开关（默认关 —— 打开它 = 键盘启用，
     与左栏「开启键盘」同一个开关）+「完整体验模式」开关（第一个打开后才显现，默认关；
     鸿蒙系统里「完整体验模式」就是完全访问这个权限 —— 直接绑 permissions.keyboard，
     与左栏「键盘完全访问」同一个开关，开 / 关两处同步，见 toggleGuideFull）。
     开关**只改设备状态**：这一页是模拟的系统页面，主 App 感知不到权限变化 ——
     两颗开关都开好后再「回到 App」（设置页左上角返回箭头 / 左下角悬浮窗）才校验与完成引导。 */
  function appGuideDetail() {
    const enabled = state.permissions.kbEnabled, full = state.permissions.keyboard;
    return `<div class="hz-page">
      <header class="hz-top"><button class="hz-back" data-action="kb-guide-back" aria-label="返回">${icon('ArrowLeft')}</button><h1>LoveCo</h1></header>
      <div class="hz-card">
        <div class="hz-row static"><span class="hz-name">启用LoveCo</span><button class="hz-switch${enabled?' on':''}" role="switch" aria-checked="${enabled}" aria-label="启用LoveCo" data-action="kb-guide-enable"><i aria-hidden="true"></i></button></div>
        ${enabled?`<div class="hz-row static hz-row-late"><span class="hz-name">完整体验模式</span><button class="hz-switch${full?' on':''}" role="switch" aria-checked="${full}" aria-label="完整体验模式" data-action="kb-guide-full"><i aria-hidden="true"></i></button></div>`:''}
      </div>
      ${guidePip()}
    </div>`;
  }
  /* 模拟 iOS 设置里的「键盘」页 —— LoveCo 键盘的权限页（深色整页，2026-09-28 按设计图补入）：
     从 iOS 设置页点「键盘」行进来（页面列表条目 kb-guide-detail-ios「系统-键盘权限 (ios)」）。
     与鸿蒙那一页（appGuideDetail）是**同一件事的两套外观**：顶部导航条是蓝色「‹ LoveCo 键盘」
     （左字＝上一页页名）+ 居中标题「键盘」，下面一张圆角卡片两行 —— ①「LoveCo 键盘」＋开关
     （= 键盘启用，permissions.kbEnabled，与左栏「开启键盘」同一个开关）；② 键盘图形 +
     「允许完全访问」＋开关（= 完全访问权限，permissions.keyboard，与左栏「键盘完全访问」
     同一个开关）—— **iOS 的权限名就叫「允许完全访问」**（鸿蒙那页叫「完整体验模式」），
     第二个开关仍是第一个打开后才显现（与鸿蒙同一条判定）。
     两颗开关都**只改设备状态**（模拟的系统页面，主 App 感知不到权限变化）；返回箭头回 iOS
     设置页（纯导航、不完成引导）；「返回 App」的出口是 iOS 设置页的左上角返回箭头 / 左下角悬浮窗。 */
  function appGuideDetailIos() {
    const enabled = state.permissions.kbEnabled, full = state.permissions.keyboard;
    return `<div class="hz-page ios-set-page">
      <header class="ios-set-nav"><button class="ios-set-back" data-action="kb-guide-back"><i class="ios-set-chev" aria-hidden="true"></i>LoveCo 键盘</button><h1>键盘</h1></header>
      <div class="ios-set-card sep-lead lead">
        <div class="ios-set-row"><span class="ios-set-main"><span class="ios-set-name">LoveCo 键盘</span></span><button class="ios-set-switch${enabled?' on':''}" role="switch" aria-checked="${enabled}" aria-label="LoveCo 键盘" data-action="kb-guide-enable"><i aria-hidden="true"></i></button></div>
        ${enabled?`<div class="ios-set-row"><span class="ios-set-ic kbd" aria-hidden="true">${window.LoveCoSystemGlyphs.setKbd}</span><span class="ios-set-main"><span class="ios-set-name">允许完全访问</span></span><button class="ios-set-switch${full?' on':''}" role="switch" aria-checked="${full}" aria-label="允许完全访问" data-action="kb-guide-full"><i aria-hidden="true"></i></button></div>`:''}
      </div>
      ${guidePip()}
    </div>`;
  }
  /* 对象：对象管理列表（整页）—— 与键盘形态的管理页同一份数据、同一套排序（最近操作在前）。
     这一页就是对象管理：没有「不选择」行（清空当前上下文只走键盘形态的管理页），标题行下
     也不写「当前上下文：…」说明，点行也不改当前上下文（切当前对象只在键盘形态的管理页里做）。
     行内自上而下：圆形头像 + 备注名，**写过备注的对象**再跟一行备注（最多两行，见 .app-note，
     没备注的行不占位、不写「还没有备注 —— …」提示语）。
     整行（含头像）都是点击区（.partner-open）：按下时整行高亮，松开进该对象的编辑页（详情）；
     左滑仍露出编辑 / 删除（编辑与行点击同一动作）。 */
  function appPartnersPage() {
    const rows = state.partners.map(p=>`<div class="sheet-list-item swipe-row"><div class="row-actions"><button type="button" class="row-action edit" data-action="edit-partner:${esc(p.id)}" aria-label="编辑 ${esc(p.name)}">${icon('EditPen')}</button><button type="button" class="row-action del" data-action="remove-partner:${esc(p.id)}" aria-label="删除 ${esc(p.name)}">${icon('Delete')}</button></div><div class="row-slide"><button class="partner-open" data-action="edit-partner:${esc(p.id)}" aria-label="查看并编辑 ${esc(p.name)}">${partnerAvatar(p)}<span class="partner-open-text"><strong>${esc(p.name)}</strong>${p.note?`<p class="app-note">${esc(p.note)}</p>`:''}</span></button></div></div>`).join('');
    return `<div class="app-content app-page">
      <div class="app-page-head"><h2>聊天对象</h2><button class="text-button" data-action="new-partner">${icon('Plus')}新建</button></div>
      <div class="app-card app-card-list">${rows||'<p class="muted app-empty">还没有聊天对象，点右上角「新建」添加。</p>'}</div>
    </div>`;
  }
  /* 我的：按设计图重做 —— 问候（点它进「用户」—— 原「个人资料」，2026-10-04 改成设置式整页）+ 会员横幅 +
     账户 / 支持 / 隐私与协议三组卡片（**2026-10-04 需求：「账户」组按需求加回**，排在「支持」之上、
     紧跟会员横幅，两行 = 会员中心 / 邀请有礼，见下）。**2026-10-04 晚些需求：「客户支持」
     这组改名「支持」**，卡里两行也换过一轮 —— 原首行「键盘内容投诉与举报」（report 动作，进「问题反馈」页
     并预选「投诉与举报」）整行删除、**第二行改放「联系客服」**（support 动作 → 弹「联系客服」弹层，
     见 supportSheet；**2026-10-04 再改：排在「反馈与建议」下面**，弹层里也只剩一行客服邮箱 ——
     最初一起做的客服微信可复制行与服务时间展示行都按需求删掉；**点那行复制完邮箱就收起弹层**），
     第一行「反馈与建议」不动。
     设计图里的「基础设置（键盘基础预设）」「消息提醒
     （消息通知）」两组与右上角邮箱图标按需求不做（键盘设置入口先挂首页、首页清空后已无）；
     四条协议直接打开对应正文整页（2026-10-04 需求前是覆盖层，见 openAppLegal）—— 卡片原末尾还有一行
     「协议中心」（8 份协议的列表整页），2026-10-04 晚些按需求删除，本卡现在只有这四行。
     2026-09-26 按需求删除三行入口：「在线客服」（support 页删除）、「我的订单」「兑换积分」
     （orders / redeem 两个页面删除）——「账户」卡片当时只剩「退出登录」一行；**2026-10-04
     需求：「账户」栏目整组删除**（退出登录仍从「用户」页页尾那颗卡进）、**同日再按需求把这一组加回来**：
     现在的「账户」组是「会员中心」+「邀请有礼」两行（不再有退出登录 —— 那一行不回到本页，
     只在「用户」页页尾；**2026-10-05 需求：原「会员与积分」行改名「会员中心」**）：
       ·「会员中心」→ **「会员购买页 · 新」** purchase2-copy（app-membership 动作；
         **2026-10-06 起与会员横幅同一落点** —— 第一个购买页 purchase 同日已按需求整页删除、
         勿再补回，这一行不再是与卡片分头的那一条；原「L+ 会员」页 purchase2 也已删）；
         原「会员与积分」整页 2026-09-26 已删，这里不重建那页）；
       ·「邀请有礼」→ **「邀请有礼」整页**（2026-10-05 起：该页已按需求做出，原「邀请有礼 ·
         即将上线」轻提示撤掉；invite 动作 → openAppScreen('invite')，未登录先由 needLogin
         拦到登录页 —— 与「会员中心」同一口径，见 appInvitePage）。
     同日晚些时候卡片下方那枚「注销仿真账户」文字按钮也按需求删除：注销确认框链路（delete-account /
     delete-account-confirm）与 state.deleted 一并清除，本页不再有注销类入口。
     2026-10-04 需求：**未登录也进得来这一页**（点「我的」Tab 不再直接跳登录页）——
     问候行这时不报手机号、改成「立即登录」占位（同一个 data-action="profile"，
     未登录点它由 needLogin 拦到登录页，见 action 的 profile 分支）；
     已登录的问候行 2026-10-04 晚些按需求由「你好，昵称」改「你好 + 手机号掩码」
     （`你好 ${state.phone}` = 「你好 138****8000」，只在中间留一空格、不再有逗号；
      昵称 state.nickname 自此只剩聊天页「我」的头像兜底一个用处）。
     **2026-10-05 需求：已开通会员时问候行下方那行金色会员标识（小方块「LoveCo」+「会员到期日
     2026-09-30」/ 永久档「永久会员 · 已解锁无限次AI使用」）整行删除** —— 主 App 的会员到期日
     改由会员横幅内的「2026-09-30到期」一行承担（右对齐，见 memberBanner / memberExpiryText），
     问候行现在两种态都只有一行手机号 / 「立即登录」。
     2026-10-06 需求：问候行离状态栏太近，上内边距 2 → 14px（theme.css .app-hello 两条）；
     同日需求把本页问候行与各组行的悬停蓝色高亮（.app-hello.as-button:hover / .app-row:hover）删掉。
     同日晚些需求：问候行与下方会员横幅的间距太大 —— 问候行再往下压（上内边距 14 → 18px、
     底内边距 9 → 7px），横幅 margin-top 14 → 8px，两块之间空隙 23 → 15px（theme.css）。
     进页 0.5 秒后按蜂窝网络开关补弹「一键登录」/「手机号登录」页（见 app-tab 动作）。
     2026-10-04 需求：**页尾补一组「更多」**（设计图里排在「隐私与协议」之下的一组）——
     只有一行「关于 LoveCo」+ 副说明版本号（`Version 1.9.0`，见 appRowSub / APP_VERSION）：
     设计图原文是「关于 Lovekey 键盘 / 这是一款可以帮你聊天的键盘输入法」与
     「Version 1.9.0 / 上线一些新人设」**两行**，按需求品牌改 LoveCo、版本号挪进本行副说明、
     独立版本条目不再出现；**2026-10-04 晚些这一行接上了落地页**（原先只摆视觉）——
     点它进「关于 LoveCo」整页（appScreen='about'，见 appAboutPage）。
     2026-10-06 需求：**行下的副说明版本号「Version 1.9.0」删掉** —— 这行退回普通单行
     appRow('关于 LoveCo','about')，版本号只留在「关于 LoveCo」页的品牌区（APP_VERSION 仍在用）。 */
  function appAccountPage() {
    return `<div class="app-content app-page">
      <button class="app-hello as-button" data-action="profile"><span class="hello-text"><strong>${state.loggedIn?`你好 ${esc(state.phone)}`:'立即登录'}</strong></span><i class="chev" aria-hidden="true">${icon('ArrowRight')}</i></button>
      ${memberBanner()}
      ${appSection('账户',[appRow('会员中心','app-membership'),appRow('邀请有礼','invite')].join(''))}
      ${appSection('支持',[appRow('反馈与建议','feedback'),appRow('联系客服','support')].join(''))}
      ${appSection('隐私与协议',[appRow('用户协议','legal:terms'),appRow('隐私政策','legal:privacy'),appRow('个人信息收集清单','legal:collection'),appRow('第三方信息共享清单','legal:sharing')].join(''))}
      ${appSection('更多',appRow('关于 LoveCo','about'))}
    </div>`;
  }
  /* —— 主 App · 「关于 LoveCo」页（appAboutPage，appScreen='about'）——
     2026-10-04 需求：点「我的」页尾「更多」组的「关于 LoveCo」进这一页（原先是纯展示行）。
     按用户给的设计图（参考「关于 Lovekey」页）排成：页头（返回钮 + 居中标题「关于 LoveCo」）→
     品牌区（LoveCo 图标 + 应用名「LoveCo」+ 灰字版本号 `Version 1.9.0`）→ 页尾沉底的
     APP 备案信息（`APP 备案编号：鄂ICP备2026043044号-2A`，见 APP_ICP）。
     2026-10-04 需求：品牌区之下原有一张「隐私与协议」卡片（4 份快照取 ABOUT_LEGAL_KEYS、
     点行进对应协议正文整页；原六行里的会员协议与续费协议两行更早已从这里删掉）。
     2026-10-06 需求：**这张卡片整块删除**（用户原话「关于 LoveCo页面删除 隐私与协议」）——
     常量 ABOUT_LEGAL_KEYS 随之作废已删，四条协议正文的入口现在只在「我的」·「隐私与协议」组
     （快照本身保留：kb-paywall、购买页协议行、注销页仍在读）。
     同一条需求的第二句「icon 和版本号居中」：品牌区（图标 / 应用名 / 版本号）**在页头与
     备案行之间占满并纵向居中**（.about-hero 的 flex:1 + justify-content:center），
     不是挤在页头下方、把下半屏留空。
      2026-10-06 追加需求「位置在往上移一移」：**在居中之位再上移 48px** —— 骨架不动，
     靠皮肤里 .about-hero 的下内边距（14px 0 → 14px 0 110px）抬一半。
     **设计图里的三块按需求不呈现**：应用描述那两行（「…是一款聚焦聊天回复…的 AI 输入工具」）、
     「联系客服」按钮，以及协议行左侧的小图标。本页不属于任何 Tab（无底部 Tab 栏），
     整页走通用浅灰画布 + 白色卡片（跟随深色外观，不另开一套写死配色）。 */
  function appAboutPage() {
    return `<div class="app-content app-page about-page">
      <div class="app-page-head user-head about-head">
        <button class="user-back" data-action="about-back" aria-label="返回">${icon('ArrowLeft')}</button>
        <h2>关于 LoveCo</h2>
        <span class="user-head-side" aria-hidden="true"></span>
      </div>
      <div class="about-hero">
        <img class="about-icon" src="assets/brand/LoveCo_128_128.png" alt="LoveCo">
        <h1 class="about-name">LoveCo</h1>
        <p class="about-version">Version ${APP_VERSION}</p>
      </div>
      <p class="about-icp">APP 备案编号：${APP_ICP}</p>
    </div>`;
  }
  /* —— 主 App · 用户（原「个人资料」，2026-10-04 按设计图重做，同日晚些再按反馈微调）——
     从「我的」页问候行进入的整页设置页（appScreen='profile'，见 appScreenContent）。
     原页面内容（昵称 / 性别 / 年龄段编辑表单 + 保存按钮）按需求整体删除，改为设计图的
     「设置」式布局：页头（左侧圆形返回钮回「我的」+ 居中标题「用户」）+ 三张白卡
     （无分组标题，卡间距 12px、卡内一行 = .app-row 骨架、行高 52px）+ 页尾单独一张
     「退出登录」卡（蓝字居中，走既有 logout：清会话 → 回首页并进登录页）。
     **「退出登录」沉在正文底**（2026-10-04 反馈：位置固定为离底部 Tab 栏一定间距处）——
     整页 min-height:100% + 按钮 margin-top:auto，间距见 theme.css 的 .user-logout。
     行内容按 2026-10-04 反馈逐条落位（图里的「微信账号」「Apple 账号」两行改成「性别」「出生日期」；
     值取存档：用户 ID / 手机号 / 性别 / 出生日期）：
       ① 用户 ID（右值 + 复制图标，点它写剪贴板、图标变勾 1.2 秒；**不带折角箭头**）+
          手机号（纯展示、无箭头）—— 该行标签原为「会员 ID」、手机号原在第二张卡，同日按反馈并到这张卡；
       ② 性别（未设置时灰字「未设置」、点开二选；**设置后不可修改** —— 行不可点、也不画箭头）+
          出生日期（未设置时灰字「未设置」，设置前后都可点开滚轮改）；
       ③ 注销账号（点它进独立注销页 —— 2026-10-04 晚些需求：注销链路按新设计图重建，
          独立整页 + 成功弹框，见 appCancelPage；不再是仅视觉的空行）；
          **整行文字 2026-10-04 按反馈转灰**（row 的 muted 变形 → .user-row-muted，见 theme.css）。
     **「昵称」行同日按反馈删除**（连同它的改名弹层 / PATCH /v1/me 仿真一起，见 action 里的说明）：
     昵称仍留在存档里（聊天页「我」的头像兜底照用 —— 问候行 2026-10-04 晚些起改报手机号掩码，
     已不再用昵称），只是本页不再显示、不再可改。
     性别 / 出生日期两行点开**就地弹层**编辑（见 userSheet()）：性别点即改、
     出生日期用三列滚轮（复用资料引导那套骨架）。 */
  function appUserPage() {
    /* 本页一行：默认「左标签 + 右值 + 折角箭头」，按图几种变形 ——
       dim = 值灰色（未设置）、chevron:false = 不画箭头（用户 ID / 手机号，以及设置过的性别）、
       copy = 右端换成复制图标（用户 ID）、muted = 整行文字转灰（注销账号行，2026-10-04 反馈）；
       没有 action 的行渲染成 div（不可点），有 action 的整行可点。 */
    const row = (label,{end='',action='',dim=false,chevron=true,copy=false,muted=false}={}) => {
      const inner = `<span class="app-row-label">${esc(label)}</span>${end?`<span class="app-row-end${dim?' dim':''}">${esc(end)}</span>`:''}${copy?`<button class="user-copy" data-action="copy-member-id" aria-label="复制用户 ID">${icon(state.memberIdCopied?'Check':'CopyDocument')}</button>`:''}${chevron?`<i class="chev" aria-hidden="true">${icon('ArrowRight')}</i>`:''}`;
      const cls = `app-row user-row${muted?' user-row-muted':''}`;
      return action?`<button class="${cls}" data-action="${action}">${inner}</button>`:`<div class="${cls}">${inner}</div>`;
    };
    /* 性别 / 出生日期的显示值：没设过就是灰字「未设置」（「暂不设置」是旧档位的值，一并按未设置显示） */
    const gender = state.gender && state.gender!=='暂不设置' ? state.gender : '';
    return `<div class="app-content app-page user-page">
      <div class="app-page-head user-head">
        <button class="user-back" data-action="user-back" aria-label="返回">${icon('ArrowLeft')}</button>
        <h2>用户</h2>
        <span class="user-head-side" aria-hidden="true"></span>
      </div>
      <section class="app-card user-card">
        ${row('用户 ID',{end:state.memberId,copy:true,chevron:false})}
        ${row('手机号',{end:state.phone,chevron:false})}
      </section>
      <section class="app-card user-card">
        ${row('性别',{end:gender||'未设置',dim:!gender,action:gender?'':'edit-gender',chevron:!gender})}
        ${row('出生日期',{end:state.birthday||'未设置',dim:!state.birthday,action:'edit-birthday'})}
      </section>
      <section class="app-card user-card">
        ${row('注销账号',{action:'user-cancel',muted:true})}
      </section>
      <button class="app-card user-logout" data-action="logout">退出登录</button>
    </div>`;
  }
  /* 「用户」页两处编辑的**就地弹层**（底部卡片，挂点见 renderApp 的 state.userSheet 一处）：
     性别二选（男 / 女两行，点即改并收层 —— 行上设置过之后就不再给入口，见 appUserPage）、
     出生日期（三列滚轮 —— 骨架直接复用资料引导的 .onb-col / .onb-row，滚动吸附与两端 mask
     同一套；onb 那条白底选中带在白卡上看不出来，.user-wheel 下换成浅灰底，见 theme.css）。
     昵称改名弹层随「昵称」行于 2026-10-04 一并删除（动作 edit-nickname / save-nickname 同去）。
     X / Esc 只收本层（动作 user-sheet-close），不动「用户」页。 */
  function userSheet() {
    const close='user-sheet-close';
    if(state.userSheet==='gender'){
      const pick=v=>`<button class="row-button" data-action="pick-gender:${v}">${icon(v===state.gender?'CircleCheck':'User')}<span style="flex:1">${v}</span>${v===state.gender?icon('Check'):''}</button>`;
      return sheet('性别',pick('男')+pick('女'),'',close);
    }
    if(state.userSheet==='birthday'){
      const p=userPicked();
      const col=(key,list,fmt,cur)=>`<div class="onb-col" data-col="${key}">${list.map(v=>`<button class="onb-row${v===cur?' on':''}" data-v="${v}">${fmt(v)}</button>`).join('')}</div>`;
      return sheet('出生日期',`<div class="user-wheel"><div class="onb-wheel">${col('y',ONB_YEARS,v=>v+'年',p.y)}${col('m',ONB_MONTHS,v=>v+'月',p.m)}${col('d',ONB_DAYS,v=>v+'日',p.d)}</div><p class="onb-meta" id="user-meta">${userMetaText()}</p></div>`,primary('保存','save-birthday','Check'),close);
    }
    return '';
  }
  /* 出生日期弹层的草稿与文案：打开时按当前生日初始化滚轮（还没有生日就与首次登录那一步
     同一个默认 2006-09-28），保存时把停着的那天写回 state.birthday（顺带对上 age 档）。 */
  function initUserPick(){
    const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(state.birthday||'');
    state.userPick = m ? {y:Number(m[1]),m:Number(m[2]),d:Number(m[3])} : {y:2006,m:9,d:28};
  }
  function userPicked(){
    const p=state.userPick||{y:2006,m:9,d:28};
    return {y:p.y,m:p.m,d:Math.min(p.d,onboardDayMax(p.y,p.m))};
  }
  function userMetaText(){
    const {y,m,d}=userPicked();
    return `<span>${ageFrom(y,m,d)}岁</span><span>${zodiacOf(m,d)}</span>`;
  }
  /* —— 主 App · 注销账号（appCancelPage，2026-10-04 新增：注销链路按设计图重建）——
     从「用户」页第三张卡的「注销账号」行进（user-cancel），是**独立整页**
     （appScreen='cancel-account'、无底部 Tab、整页白底、状态栏连着转白）。
     旧的「注销仿真账户」确认框链路 2026-09-26 已整体删除，本页不是它的回归 —— 形态照设计图重做：
     ① 页头：左侧圆形返回钮（cancel-back 回「用户」页）+ 居中标题「注销账号」（复用用户页 .user-head 骨架）；
     ② 正文（左对齐、无卡片）：加粗句「为保证您的权益，请阅读以下内容」+ 两句说明 +
        「包括并不限于」两条清单 + 加粗句「注销账号，需满足以下条件：」+ 两条条件
        （2026-10-04 晚些需求：清单「历史缓存图片」改「聊天对象资料」、「第三方账号绑定关系」
        整条删除；正文说明字号同日调小一档，字号在 theme.css 的 .cd-body 一组）；
     ③ 沉底一组：灰色小字「我已阅读并同意《账号注销协议》」—— **协议名是可点文字按钮**
        （`legal:cancel`，2026-10-04 需求：点它打开协议正文，正文取 legal-data.js 的
        `cancel` 快照《用户注销协议》；**2026-10-04 晚些那版是覆盖层，同日改整页后
        变成进协议正文页、返回箭头 / Esc 回本页**）+
        整宽蓝色胶囊「确认注销」（cancel-submit）。
     点「确认注销」弹「注销申请成功」弹框（cancelAskSheet，state.cancelAsk）；点「知道了」收起弹框
     并回首页（cancel-ok）。深色外观下本页固定浅色（同购买页 / 登录页：配色写死在 theme.css）。 */
  function appCancelPage() {
    return `<div class="cd-page">
      <div class="app-page-head user-head cd-head">
        <button class="user-back" data-action="cancel-back" aria-label="返回">${icon('ArrowLeft')}</button>
        <h2>注销账号</h2>
        <span class="user-head-side" aria-hidden="true"></span>
      </div>
      <div class="cd-body">
        <h3>为保证您的权益，请阅读以下内容</h3>
        <p>注销账号后，您的个人资料、使用记录和所有关联的数据将被永久删除，无法恢复。</p>
        <p>您将无法再使用本账号，也无法找回当前账号中与账号相关的任何信息，包括并不限于：</p>
        <p>1、当前账号的个人信息</p>
        <p>2、当前账号中维护的聊天对象资料</p>
        <h3>注销账号，需满足以下条件：</h3>
        <p>1、账号处于正常使用状态，不处于封禁状态</p>
        <p>2、账号财产已结清，没有未结清权益</p>
      </div>
      <div class="cd-foot">
        <p class="cd-agree">我已阅读并同意<button type="button" class="cd-legal-link" data-action="legal:cancel">《账号注销协议》</button></p>
        <button class="cd-submit" data-action="cancel-submit">确认注销</button>
      </div>
    </div>`;
  }
  /* 「注销申请成功」弹框（state.cancelAsk，挂点见 renderApp 的 .app-shell 一处）：
     深色蒙层只盖正文区（与其它主 App 覆盖层同一语义，不盖状态栏）；白卡居中，
     卡内只有标题 / 两行冷静期说明 / 居中胶囊「知道了」一颗按钮（没有 X；Esc 也只收弹框，
     仍停在注销页，见 keydown 的 Esc 链）。 */
  function cancelAskSheet() {
    return `<div class="cd-ask" role="dialog" aria-modal="true" aria-label="注销申请成功">
      <div class="cd-ask-scrim" aria-hidden="true"></div>
      <div class="cd-ask-card">
        <h3>注销申请成功</h3>
        <p>申请注销后，7天内为账号注销冷静期，7天内再次登录，将视为放弃注销</p>
        <button class="cd-ask-primary" data-action="cancel-ok">知道了</button>
      </div>
    </div>`;
  }
  /* 「协议确认框」（state.pu2Ask，2026-10-06 晚些需求，挂点见 renderApp 的 .app-shell 一处）——
     「会员购买页 · 新」购买前的协议确认（深色蒙层 + 居中白卡，皮肤见 theme.css 的 .pu2-ask 一组）。
     打开的两条路：未勾选协议点「立即解锁」（p2-buy）、**切换档位卡**（p2-plan，点了不同档才算切换）。
     **2026-10-06 再晚些需求照新样式简化**：原标题「同意协议后继续」与说明段删掉，
     卡内只剩一句左对齐的「我已阅读并同意《自动续费协议》《会员协议》」（协议名可点开协议正文
     整页、返回后确认框还挂着；《自动续费协议》与页面协议行同一条件 —— 仅 iOS 或支付宝渠道的
     周 / 季度档渲染）+「取消 / 同意」两颗圆角按钮（右按钮由紫渐变胶囊改纯色蓝底圆角矩形）：
     「同意」= 勾上协议勾选框 + 立即按当前档调起支付（iOS 表现为弹 iOS 系统支付框，
     安卓 / 鸿蒙一键到账，见 p2-ask-ok）；「取消」/ Esc 只收框。 */
  function pu2AskSheet() {
    const renewing = state.pu2Plan!=='permanent' && (state.platform==='ios' || state.purchasePay==='alipay');
    return `<div class="pu2-ask" role="dialog" aria-modal="true" aria-label="同意协议">
      <div class="pu2-ask-scrim" aria-hidden="true"></div>
      <div class="pu2-ask-card">
        <p class="pu2-ask-text">我已阅读并同意${renewing?'<button type="button" class="pu2-legal-link" data-action="kb-legal:renewal">《自动续费协议》</button>':''}<button type="button" class="pu2-legal-link" data-action="kb-legal:membership">《会员协议》</button></p>
        <div class="pu2-ask-btns">
          <button type="button" class="pu2-ask-btn pu2-ask-no" data-action="p2-ask-cancel">取消</button>
          <button type="button" class="pu2-ask-btn pu2-ask-yes" data-action="p2-ask-ok">同意</button>
        </div>
      </div>
    </div>`;
  }
  /* —— 「永久会员立减优惠」挽留弹窗（pu2OfferSheet / state.pu2Offer，2026-10-06 需求）——
     入口 = 「会员购买页 · 新」的出口（左上角圆形叉号 p2-close 与 Esc 同一条，见
     leavePurchasePage）：命中弹窗条件时不退出页面、改弹这一层挽留 —— 用户给的参考图
     是另一款产品的同款设计（「确定放弃 L+ 会员立减优惠？」），这里照它的结构重绘，
     文案与数字换成本产品的（权益四条 / 左红块「永久会员 / 立减优惠」/ 右米块「立减 ¥40」）。
     与 .pu2-ask 同一套挂法与层级口径：铺在 .app-shell 上、深色蒙层只盖正文区；
     购买页固定浅色，本层配色也写死、不跟随 .dark（皮肤见 theme.css 的 .pu2-offer 一组）。
     结构与配色：
     ① 卡片：浅紫垂直渐变（#CBD5FD 顶部 → 近白底）+ 22px 大圆角，宽 82%（393 屏 ≈323px）；
     ② 右上角圆形 x（offer-close）= 放弃优惠 + 一并退出购买页（点它的语义就是
            「用户原本想点购买页 x 离开」，所以是退出而不是仅收层；退到哪儿看这一页是不是
            首页自动弹出的那一次 —— 自动弹出的回首页，其余回「我的」，见 leaveOfferSheet）；
     ③ 标题「确定放弃永久会员立减优惠？」（20px 800 蓝 #577CFF、居中）；
     ④ **3 分钟倒计时**（用户需求）：标题下方居中一行「优惠剩余 03:00」（红 #FF4E60 +
        时钟图标、等宽数字），进弹窗即起跳、每秒走一格（openOfferSheet 的定时器只改
        这一枚数字、不整页重渲染）；**归零自动收层**（放弃优惠、仍停在购买页，当天不再弹）；
     ⑤ 权益四条（蓝圆白勾 + 14.5px 蓝字，逐条左对齐、整块缩进居中）——
        对照参考图四条（定制专属人设 / 解锁所有聊天人设 / …）换成本产品的权益口径，
        常量 OFFER_BENEFITS 一处可改；
     ⑥ 双色块（高 96、圆角 14；左块红对角渐变 + 两行白字「永久会员 / 立减优惠」，
        右块米→粉对角渐变 + 深灰大号「立减 ¥40」+ 右端一串条形码装饰，照参考图）；
     ⑦ 「领取优惠」紫粉渐变胶囊（#4C60F8 → #FA6076，高 46、宽 73%）：
        **领取 = 记下优惠（落库 offerClaimed，永久档随即按 128 显示）+ 直接进入支付** ——
        关闭本层后按下与「立即解锁」（p2-buy）同一条分路继续（未勾协议先弹协议确认框，
        点「同意」即勾上并继续；iOS 弹 iOS 系统支付框 / 安卓·鸿蒙一键到账，见 offer-claim）。
     出口：x（offer-close）/ Esc 都是「放弃优惠 + 退出购买页」（见 leaveOfferSheet）；
       倒计时归零只收层、留在购买页。 */
  const OFFER_SECONDS = 180;
  const OFFER_SAVE = 40;
  const OFFER_PRICE = '128';
  /* 非首启场景下点购买页出口时的命中概率（2026-10-06 需求，原先是「每天第一次必弹」）：
     掷一次硬币小于它就弹这一层挽留；首启引导不走这条（必弹，见 leavePurchasePage） */
  const OFFER_POP_RATE = 0.25;
  const OFFER_BENEFITS = ['无限次使用 AI 生成','解锁全部聊天对象','键盘不限次使用','解锁全部关系阶段'];
  /* 档位现价：领过优惠（offerActive）时**只有永久档**按立减 40 后的 128 显示
     （划线原价仍取 origin 840），其余档位照表返回（见 PLUS_PLANS / OFFER_PRICE）。
     购买页的卡面经它取现价；结算只用到 days（见 checkoutPlan / completePurchase），
     价格纯展示。 */
  function offerPrice(id) {
    const p = PLUS_PLANS[id];
    if(id==='permanent' && offerActive())return OFFER_PRICE;
    return p ? p.price : '';
  }
  /* 本地日期串（'YYYY-MM-DD'）—— 「每天一次」的判据按本机自然日算 */
  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  const offerShownToday = () => state.offerDate === todayKey();
  /* 优惠是否正在生效：已领取 + 领取就是今天（跨天自动失效，当天点 x 又能再领一次） */
  const offerActive = () => state.offerClaimed && offerShownToday();
  const offerClock = s => `${String(Math.floor(Math.max(0,s)/60)).padStart(2,'0')}:${String(Math.max(0,s)%60).padStart(2,'0')}`;
  function stopOfferTimer() { if(state.pu2OfferTimer){clearInterval(state.pu2OfferTimer);state.pu2OfferTimer=null;} }
  /* 打开挽留弹窗：先把「今天已弹过」记下（无论用户领不领，当天这一次机会就此用掉），
     再起 3 分钟倒计时。定时器每秒只改 #pu2-offer-count 那一枚数字（不整页重渲染）——
     其它 render 重建 DOM 后按 id 重新取到新节点、照常继续；归零 = 收层 + 放弃优惠。
     save=false = **页面列表点入「会员购买 · 优惠券」那条静态查看**（见 setupPage）：同样把
     offerDate 记成今天（页面内存内生效，关掉弹窗后当天点叉号就真退出，与真实链路一致），
     只是不写进存档 —— 不占用用户当天那一次真实机会，刷新即恢复。 */
  function openOfferSheet(save=true) {
    state.offerDate = todayKey();
    state.pu2Offer = true; state.pu2OfferLeft = OFFER_SECONDS;
    if(save)persist();
    render();
    stopOfferTimer();
    state.pu2OfferTimer = setInterval(()=>{
      if(!state.pu2Offer){stopOfferTimer();return;}
      state.pu2OfferLeft -= 1;
      if(state.pu2OfferLeft <= 0){stopOfferTimer();state.pu2Offer=false;render();return;}
      const el = document.getElementById('pu2-offer-count');
      if(el)el.textContent = offerClock(state.pu2OfferLeft);
    },1000);
  }
  function closeOfferSheet() { state.pu2Offer=false; stopOfferTimer(); }
  /* 「会员购买页 · 新」的出口（左上角 x 与 Esc 同一条，2026-10-06 同日再改一次弹出逻辑）：
     **首启引导那一轮必弹**（state.firstLaunch 亮着 = 「模拟 › 首启引导」这条链路还没收尾 ——
     2026-10-06 再晚些需求起开关不再落到首页就关，而是陪着自动弹出的这一轮走完才关，所以这一轮里
     点 x 一定先弹挽留；firstLaunchOffer 是「走到过那一轮」的印记，同一判据）；
     **其余情况**：当天已弹过一律不弹（跨天自然恢复），没弹过则**随机 1/4 命中才弹**（OFFER_POP_RATE）。
     没弹时照原出口走：**自动弹出的那一次（pu2Launch）回首页**、手动入口进本页的回「我的」。 */
  function leavePurchasePage() {
    /* **当天已经弹过 → 一律不弹**（用户口径「当天弹过则不弹，第二天重置」；跨天由日期比对
       自然恢复 —— 这是第一道闸门，首启那一轮与随机那条都在它之后判） */
    if(offerShownToday()){
      const back0 = state.pu2Launch ? 'home' : 'account';
      state.pu2Launch = false;
      return openAppScreen(back0);
    }
    /* 首启那一轮**必弹**（state.firstLaunch 亮着 = 这一轮付费墙还没收尾；firstLaunchOffer =
       「本次启动走过那一轮」的印记）—— 不掷那记随机：需求的话术就是「点 x 必弹」 */
    if(state.firstLaunch||state.firstLaunchOffer)return openOfferSheet();
    /* 其余情况**随机 1/4 命中才弹**（OFFER_POP_RATE） */
    if(Math.random()<OFFER_POP_RATE)return openOfferSheet();
    const back = state.pu2Launch ? 'home' : 'account';
    state.pu2Launch = false;
    return openAppScreen(back);
  }
  /* 放弃优惠 → 退出购买页（弹窗右上角 x 与 Esc 两条出口共用）：退回哪儿与购买页出口同一口径 ——
     自动弹出的那一次（pu2Launch）回首页，其余回「我的」；本层与倒计时一并收起。 */
  function leaveOfferSheet() {
    closeOfferSheet();
    /* 放弃优惠 ≠ 优惠立刻作废（2026-10-06 需求）：**资格再保留 3 分钟**，回到的那一页
       当场起跳 —— 首页上浮出那颗可拖动的「限时特惠」卡（见 offerBadge / startOfferBadge） */
    startOfferBadge();
    const back = state.pu2Launch ? 'home' : 'account';
    state.pu2Launch = false;
    return openAppScreen(back);
  }
  /* —— 首页「限时特惠」悬浮卡（offerBadge / state.offerBadge，2026-10-06 需求）——
     入口 = 「永久会员立减优惠」挽留弹窗被放弃的那一刻（leaveOfferSheet）：用户关掉弹窗
     仍不想买，就把**优惠资格再留 3 分钟**，用首页上一颗**可以拖动的悬浮卡**兜住 ——
     参考图是另一款产品的同款浮标（深红标题条「甜蜜助攻卡」+ 粉色卡身 + 倒计时），
     这里照它的结构重绘，标题文案换成本产品的「**限时特惠**」。
     结构与配色（皮肤见 theme.css 的 .ofb 一组）：
     ① 整枚卡 116×82、**圆角 14**、粉→洋红对角渐变（#FF5C8A → #FE2CCF）+ 柔和投影，
        默认**贴右下**（距右 14、距底 84 —— 让开 68 高的底部 Tab 栏），拖动后按坐标定位；
     ② 顶部**深红标题条**（#BD0262，高 24）：居中白字「限时特惠」（12px 700、字距 1px）；
     ③ 卡身两行居中：**毫秒倒计时**（18px 800 白字、等宽数字，格式 `MM:SS:mmm`，
        默认从「03:00:000」起跳）+ 下面一行小字「点击立即支付」（10px、白字 85%）；
     ④ **可以拖**：按住即跟着手指 / 鼠标走，松手停在原地（不出屏、不压状态栏与 Tab 栏）；
        拖过的那一下不算点击（阈值 4px），松手也不重渲染（只改内联样式 + 记坐标）；
     ⑤ **点一下 = 直接调起支付**（payFromOfferBadge，不进购买页再按一次「立即解锁」）；
     ⑥ 倒计时归零 / 已是会员 = 整枚卡自动消失（优惠资格作废）。
     只在**主 App 首页**渲染（renderApp 的浮层一串；切到别的 Tab / 页就不画，定时器照走）。 */
  const OFFER_BADGE_MS = 180000;      /* 3 分钟 */
  const OFFER_BADGE_TICK_MS = 47;     /* 毫秒那一位要肉眼可见地跳：约每帧多一点点 */
  const OFFER_BADGE_LABEL = '限时特惠';
  const OFFER_BADGE_HINT = '点击立即支付';
  /* 剩余毫秒：按到期时刻现算（定时器被节流也不走慢） */
  const offerBadgeLeft = () => Math.max(0, state.offerBadgeEnds - Date.now());
  /* `MM:SS:mmm` —— 例 03:00:000（用户需求指定的这一格式，秒后是三位毫秒） */
  function offerBadgeClock(ms) {
    const s = Math.floor(ms/1000);
    return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}:${String(ms%1000).padStart(3,'0')}`;
  }
  function stopOfferBadgeTimer() { if(state.offerBadgeTimer){clearInterval(state.offerBadgeTimer);state.offerBadgeTimer=null;} }
  /* 整枚卡收摊（归零 / 已成会员）：开关、坐标与定时器一起清 */
  function stopOfferBadge() { state.offerBadge=false; state.offerBadgePos=null; stopOfferBadgeTimer(); }
  /* 起跳：只在放弃弹窗那一刻调一次（已是会员不摆这颗卡） */
  function startOfferBadge() {
    if(state.member)return;
    state.offerBadge=true; state.offerBadgePos=null;
    state.offerBadgeEnds=Date.now()+OFFER_BADGE_MS;
    stopOfferBadgeTimer();
    state.offerBadgeTimer=setInterval(tickOfferBadge,OFFER_BADGE_TICK_MS);
  }
  /* 每格只改卡上那一枚数字（不整页重渲染 —— 重建 DOM 会把正在拖的那一下打断）；
     归零 = 收摊 + 重渲染（卡消失）。 */
  function tickOfferBadge() {
    if(state.member){stopOfferBadge();render();return;}
    const left=offerBadgeLeft();
    if(left<=0){stopOfferBadge();render();return;}
    const el=document.getElementById('ofb-time');
    if(el)el.textContent=offerBadgeClock(left);
  }
  function offerBadge() {
    const pos=state.offerBadgePos;
    return `<div class="ofb" id="ofb-badge"${pos?` style="left:${pos.x}px;top:${pos.y}px;right:auto;bottom:auto;"`:''} role="button" tabindex="0" aria-label="${esc(OFFER_BADGE_LABEL)}，${esc(OFFER_BADGE_HINT)}">
      <span class="ofb-label">${esc(OFFER_BADGE_LABEL)}</span>
      <b class="ofb-time" id="ofb-time">${offerBadgeClock(offerBadgeLeft())}</b>
      <span class="ofb-hint">${esc(OFFER_BADGE_HINT)}</span>
    </div>`;
  }
  /* 拖动（bindOfferBadge 挂的事件）+ 点击：两者互斥（拖过不算点），
     所以这颗卡**不挂 data-action**（click 由 bindOfferBadge 自己接管）。 */
  function bindOfferBadge() {
    const el=document.getElementById('ofb-badge');
    if(!el)return;
    const phone=el.closest('.app-phone');
    if(!phone)return;
    let pid=null,sx=0,sy=0,ox=0,oy=0,moved=false;
    el.addEventListener('pointerdown',e=>{
      if(e.button)return;
      const r=el.getBoundingClientRect(), p=phone.getBoundingClientRect();
      pid=e.pointerId; sx=e.clientX; sy=e.clientY; ox=r.left-p.left; oy=r.top-p.top; moved=false;
      try{el.setPointerCapture(e.pointerId);}catch(_){/* 捕获失败不影响拖动 */}
    });
    el.addEventListener('pointermove',e=>{
      if(e.pointerId!==pid)return;
      const dx=e.clientX-sx, dy=e.clientY-sy;
      if(!moved && Math.abs(dx)<4 && Math.abs(dy)<4)return;
      moved=true;
      /* 不出屏、不压状态栏与底部 Tab 栏（68）：四边各留 8 */
      const maxX=phone.clientWidth-el.offsetWidth-8, maxY=phone.clientHeight-el.offsetHeight-76;
      const x=Math.max(8,Math.min(maxX,ox+dx)), y=Math.max(8,Math.min(maxY,oy+dy));
      el.style.left=`${x}px`; el.style.top=`${y}px`; el.style.right='auto'; el.style.bottom='auto';
    });
    el.addEventListener('pointerup',e=>{
      if(e.pointerId!==pid)return;
      pid=null;
      if(!moved)return;
      /* 松手才把坐标记进 state（拖动中不重渲染，避免整页重建把这一下打断） */
      state.offerBadgePos={x:parseFloat(el.style.left)||0,y:parseFloat(el.style.top)||0};
    });
    el.addEventListener('pointercancel',()=>{pid=null;});
    el.addEventListener('click',()=>{ if(!moved)action('offer-badge'); });
  }
  /* 点这颗卡 = **直接调起支付**（2026-10-06 需求）—— 与弹窗里那颗「领取优惠」
     （offer-claim）同一条分路：记下优惠（永久档随即按 ¥128 显示）、落到「会员购买页 · 新」、
     再按下它的「立即解锁」（未勾协议先弹协议确认框，点「同意」即继续：
     iOS 弹 iOS 系统支付框 / 安卓·鸿蒙一键到账）。
     **倒计时不因此停下** —— 协议框点「取消」回到购买页、再回首页，浮卡照旧在。 */
  function payFromOfferBadge() {
    if(state.paymentBusy)return;
    state.offerClaimed=true; persist();
    openAppScreen('purchase2-copy');
    if(!state.pu2Agreed){state.pu2Ask=true;return render();}
    if(state.platform==='ios')return openIosPaySheet();
    return completePurchase();
  }
  function pu2OfferSheet() {
    const benefits = OFFER_BENEFITS.map(t=>`<li><i class="pu2-offer-check" aria-hidden="true">${icon('Check')}</i>${esc(t)}</li>`).join('');
    return `<div class="pu2-offer" role="dialog" aria-modal="true" aria-label="永久会员立减优惠">
      <div class="pu2-offer-scrim" aria-hidden="true"></div>
      <div class="pu2-offer-card">
        <button type="button" class="pu2-offer-close" data-action="offer-close" aria-label="放弃优惠并退出">${icon('Close')}</button>
        <h3 class="pu2-offer-title">确定放弃永久会员立减优惠？</h3>
        <p class="pu2-offer-timer">${icon('Clock')}<span>优惠剩余</span><b id="pu2-offer-count">${offerClock(state.pu2OfferLeft)}</b></p>
        <ul class="pu2-offer-list">${benefits}</ul>
        <div class="pu2-offer-deal">
          <div class="pu2-offer-left"><span>永久会员</span><span>立减优惠</span></div>
          <div class="pu2-offer-right"><b class="pu2-offer-cut"><span>立减</span><i>¥</i>${OFFER_SAVE}</b><span class="pu2-offer-code" aria-hidden="true"></span></div>
        </div>
        <button type="button" class="pu2-offer-cta" data-action="offer-claim">领取优惠</button>
      </div>
    </div>`;
  }
  /* —— 「兑换码」半屏底部弹层（redeemSheet，state.redeemSheet，2026-10-06 新增）——
     入口是「会员购买页 · 新」底部那枚「兑换码」白胶囊（p2-redeem，仅安卓 / 鸿蒙渲染）——
     原「兑换码即将开放」轻提示作废。弹层从手机底部**滑上来的半屏卡片**（高 50%，
     骨架 .rd-* 在 styles.css、皮肤在 theme.css；挂点在 renderApp 的浮层一串（手机根
     .app-phone 内、与协议确认框并排 —— 铺满整机含状态栏），贴底对齐、不是居中弹框）。两态：
     ① **输入态**：顶部抓手 + 居中标题「兑换码」+ 右上角圆形 X（redeem-close）；
        大号居中输入框（自动转大写、只留字母数字、最长 12 位，见 bindRedeemSheet）
        + 校验提示行（REDEEM_ERRORS 的文案，有错才出现）+ 沉底的「立即兑换」紫渐变胶囊
        （redeem-submit，空输入置灰不可点）；
        **2026-10-06 再晚些需求**：原「一句说明（输入兑换码，会员时长立即到账）+
        底部规则小字（每个兑换码仅限使用一次…）」两处提示都删掉，输入框改居中布局；
        有效码点「立即兑换」随机成功 / 失败 —— 失败就在校验提示行给一行「抱歉，兑换失败」；
     ② **成功态**（state.redeemDone）：品牌绿大勾 + 「兑换成功」+「会员时长 +N 天」+
        到期日一行（memberBadgeText()，与邀请页成功块同一份文案源）+ 沉底「完成」胶囊
        （redeem-done，收起弹层）。
     出口：X / Esc / 「完成」都只收本层、仍停在购买页；换页由 openAppScreen 收起。
     演示码表 REDEEM_CODES：LOVECO7 / LOVECO30 / LOVECO365 → 7 / 30 / 365 天（通过校验的
     有效码点击「立即兑换」后**随机**成功 / 失败 —— 失败不到账、不消耗码，可重试），
     其余任意码按「兑换码无效或已过期」处理（真机上由服务端判定归属与有效期）。 */
  const REDEEM_CODES = { LOVECO7:7, LOVECO30:30, LOVECO365:365 };
  const REDEEM_ERRORS = {
    empty:'请输入兑换码',
    format:'兑换码格式不正确，应为 4-12 位字母或数字',
    used:'该兑换码已被使用',
    /* 2026-10-06 再晚些需求：原「兑换码无效或已过期，请检查后重试」删掉后半句 */
    invalid:'兑换码无效或已过期',
    /* 2026-10-06 再晚些需求：有效码点「立即兑换」随机失败时的那一行（见 redeem-submit） */
    failed:'抱歉，兑换失败',
    forever:'你已是永久会员，兑换码不再叠加',
  };
  /* 兑换码的会员到账（与邀请的 grantInviteDays 同口径：非会员从此刻起算 N 天、有效会员在原
     到期日上顺延 N 天、永久会员不再叠加 —— 返回 false，调用方把它换成 REDEEM_ERRORS.forever）。
     两处各留各的函数：邀请奖励与兑换码各自演进，不合并（同拷贝页那套「别当重复代码并掉」的口径）。 */
  function grantRedeemDays(days) {
    if(state.member && state.memberExpiry===0)return false;
    const base = state.member && state.memberExpiry>0 ? state.memberExpiry : Date.now();
    state.member=true;
    state.memberExpiry=base+days*86400000;
    return true;
  }
  function redeemSheet() {
    const err = state.redeemError
      ? `<p class="rd-error" role="alert">${icon('Warning')}${esc(REDEEM_ERRORS[state.redeemError]||'')}</p>` : '';
    const body = state.redeemDone
      ? `<div class="rd-done">
          <i class="rd-done-ico" aria-hidden="true">${icon('CircleCheck')}</i>
          <h3 class="rd-done-title">兑换成功</h3>
          <p class="rd-done-main">会员时长 +${state.redeemDone.days} 天</p>
          <p class="rd-done-sub">${esc(memberBadgeText())}</p>
        </div>
        <button type="button" class="rd-cta" data-action="redeem-done">完成</button>`
      : `<input class="rd-input${state.redeemError?' err':''}" id="redeem-code" maxlength="12" autocomplete="off" spellcheck="false" placeholder="请输入兑换码" value="${esc(state.redeemDraft)}">
        ${err}
        <button type="button" class="rd-cta" data-action="redeem-submit" ${state.redeemDraft?'':'disabled'}>立即兑换</button>`;
    return `<div class="rd-sheet${state.redeemEnter?' entering':''}" role="dialog" aria-modal="true" aria-label="兑换码">
      <div class="rd-scrim" aria-hidden="true"></div>
      <div class="rd-card">
        <span class="rd-handle" aria-hidden="true"></span>
        <div class="rd-head"><h2 class="rd-title">兑换码</h2><button type="button" class="rd-close" data-action="redeem-close" aria-label="关闭兑换码弹层">${icon('Close')}</button></div>
        ${body}
      </div>
    </div>`;
  }
  /* —— 「联系客服」弹层（2026-10-04 需求；state.supportSheet，挂点见 renderApp 的 .app-shell 一处）——
     「我的」·「支持」组的**第二行**点它弹出（support 动作，排在「反馈与建议」下面），是
     **通用底部卡片**（sheet 骨架，与「用户」页两处就地编辑弹层同一套）。
     **2026-10-04 再改：卡内只剩一行「客服邮箱」** —— 原先一起做的「客服微信」可复制行与
     「服务时间」展示行按需求删掉（客服微信、服务时间都不再出现），设计图上这一弹就是邮箱那一条；
     右端仍是复制图标，**2026-10-04 晚些再改：点整行把邮箱写进剪贴板后立刻收起弹层**
     （不再有「图标变勾 1.2 秒」那一下 —— 弹层都收起了，勾也看不到，所以卡内就是一颗常驻的复制图标），
     所以卡内已没有纯展示行（.sp-row.static 那套样式留着备用）。
     复制的回执交给**全局轻提示**（2026-10-04 再改）：收起弹层的同时浮出一记「已复制」（showToast）。
     出口三条：复制那一行（support-copy:email）、右上角 X（support-close）与 Esc，都只收本层、仍停在「我的」页。
     邮箱写在 SUPPORT_EMAIL 一个常量里 —— 换邮箱只改那一处。 */
  /* —— 全局轻提示（2026-10-04 需求，见 state.toast / .app-toast）——
     复制这类「操作已完成」的即时回执：屏幕上浮出一枚居中偏下的深色胶囊（文案由调用方给），
     约 1.4s（TOAST_MS）后自动收掉 —— 连着触发就重新计时、只留最新一条。
     收起 = 摘掉标记重渲染（与 shotFlash 同一套写法）；面板不吃点击、也没有关闭按钮，
     它只是「发生了什么」的一记回执，不打断当前页面。 */
  const TOAST_MS = 1400;
  function showToast(msg) {
    state.toast=msg;
    clearTimeout(state.toastTimer);
    state.toastTimer=setTimeout(()=>{state.toastTimer=null;state.toast='';render();},TOAST_MS);
    render();
  }
  const SUPPORT_EMAIL = 'support@loveco.gasairea.com';
  function supportSheet() {
    return sheet('联系客服',`<button class="row-button sp-row" data-action="support-copy:email" aria-label="复制客服邮箱"><span>客服邮箱</span><span class="end">${esc(SUPPORT_EMAIL)}</span><span class="user-copy" aria-hidden="true">${icon('CopyDocument')}</span></button>`,'','support-close');
  }
  /* —— 主 App · 协议正文页（appLegalPage，appScreen='legal'）—— 2026-10-04 按设计图把协议
     从**覆盖层改回整页**：
     协议正文 2026-09-26 曾是浮在页面上的 sheet（`legalSheet` + state.appLegal，sheet 头显示协议名、
     头下一行「项目内置协议快照…」说明、页尾一颗整宽「返回」按钮），本轮这些**全部去掉**，
     照设计图重排成一整页：
     ① 链头只有一枚返回箭头（没有页名、没有 X）、**且常驻顶部**（2026-10-04 晚些需求：正文往下滚
        时页头不跟着滚走 —— .lg-head 的 position:sticky，骨架在 styles.css）—— 页名改由正文
        首行的大号加粗标题承担；
     ② 正文按空行切段、左对齐（宋体大字号，皮肤见 theme.css 的「协议正文页」一组），
        首行那份与标题重复的协议名在渲染时去掉（见 legalParagraphs）；
     ③ 没有底部「返回」按钮、没有快照说明、也不渲染底部 Tab 栏（同注销页 / 购买页）。
     整页白底、状态栏连着转白（renderApp 挂 .guide-legal，theme.css 清零 .app-main 边距）。
     来路（state.legalFrom）：「我的」四条协议直链 / 注销页《账号注销协议》/ 登录页与购买页协议行
     里的协议名 —— 返回箭头与 Esc 都回那一页（见 legalBack）。
     （「关于 LoveCo」页的协议卡 2026-10-06 需求已整块删除，不再是来路之一。）
     正文与键盘内 kb-legal 同一份快照（legal-data.js），key 取 state.legalKey。
     （同日稍晚原「协议中心」列表页（appLegalListPage + appScreen='legal-list'）按需求删除，
     本页是协议数据在手机里唯一的落点；.lg-card 等列表页样式一并清掉。） */
  function legalDoc() { return window.LOVECO_LEGAL[state.legalKey] || null; }
  /* 正文切段：先按空行分段，段内单个换行按 <br> 呈现（与原 pre-wrap 的观感一致）——
     首行是协议名本身（正文里与页面大标题重复），去掉它；判据是「不含句读且短」，
     八份快照的首行都符合，这样不必为每份协议写死一份标题 */
  function legalParagraphs(d) {
    const lines = String(d?.body || '').split('\n');
    if (lines.length && lines[0].trim().length <= 40 && !/[。！？；]/.test(lines[0])) lines.shift();
    return lines.join('\n').split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
      .map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  }
  function appLegalPage() {
    const d = legalDoc();
    /* .lg-doc：协议正文页的标题 / 正文排宋体（设计图里这两处都是宋体这一路，见 theme.css） */
    return `<div class="lg-page lg-doc">
      <div class="lg-head"><button class="lg-back" data-action="legal-back" aria-label="返回">${icon('ArrowLeft')}</button></div>
      <div class="lg-body">
        <h1 class="lg-title">${esc(d?.title || d?.name || '协议正文')}</h1>
        <div class="lg-text">${legalParagraphs(d) || '<p>暂未载入正文</p>'}</div>
      </div>
    </div>`;
  }
  /* —— 主 App · 「问题反馈」页（appFeedbackPage，appScreen='feedback'）——
     2026-10-04 按设计图从渲染工具里的一张 sheet 卡片**重做成深色整页**（页名也从
     「反馈与建议」改成设计图上的「问题反馈」）：
     ① 页头：左侧圆形返回箭头（feedback-back 回「我的」）+ **居中标题「问题反馈」**
        （复用用户页 .user-head 骨架；设计图右上角那颗「我的反馈」按需求**不呈现** ——
        原型里没有反馈历史页）；
     ② 问题类型：一排胶囊按钮（FEEDBACK_TYPES：功能问题 / 键盘问题 / AI 效果 / 建议 /
        投诉与举报 —— 最后一类是本轮需求新增；2026-10-04 晚些前「我的 · 键盘内容投诉与举报」
        进来即预选它，该行已按需求删除，现在进来一律默认「功能问题」），
        选中的那颗蓝底白字（feedback-type:<类型> 换选，草稿不丢）；
     ③ 问题描述：多行输入（占位「请尽量描述复现步骤、期望结果和手机型号」，上限 1000 字）+
        右下角实时计数「n/1000」；
     ④ 联系方式（可选）：单行输入（上限 200 字）+ 右下角计数「n/200」；
     ⑤ 整宽蓝色「提交反馈」按钮（submit-feedback）。
     设计图页尾那行灰色小字说明（提交后由客服团队处理。请勿填写密码、验证码等敏感信息。）
     已按 2026-10-04 后续需求删除，勿补回。
     整页深色（配色 / 尺寸按设计图量出，写死在 theme.css，不跟随 .dark —— 同注销页 /
     协议页那种「按图定色」的做法）、无底部 Tab（见 appTabBar），状态栏连着转深色
     （renderApp 挂 .guide-feedback）。骨架（.fb-* 的排布）在 styles.css。
     提交成功回「我的」（反馈不留历史列表，原「我的反馈」页早已删除 —— 设计图右上角的
     那颗入口不再呈现）；描述不足 5 字不提交，焦点交回输入框。 */
  const FEEDBACK_TYPES = ['功能问题','键盘问题','AI 效果','建议','投诉与举报'];
  function appFeedbackPage() {
    const chips = FEEDBACK_TYPES.map(t=>`<button class="fb-chip${t===state.feedbackType?' on':''}" data-action="feedback-type:${t}" aria-pressed="${t===state.feedbackType}">${esc(t)}</button>`).join('');
    return `<div class="fb-page">
      <div class="app-page-head user-head fb-head">
        <button class="user-back" data-action="feedback-back" aria-label="返回">${icon('ArrowLeft')}</button>
        <h2>问题反馈</h2>
        <span class="user-head-side" aria-hidden="true"></span>
      </div>
      <div class="fb-body">
        <p class="fb-label">问题类型</p>
        <div class="fb-chips">${chips}</div>
        <p class="fb-label fb-label-gap">问题描述</p>
        <textarea class="fb-textarea" id="feedback-text" maxlength="1000" placeholder="请尽量描述复现步骤、期望结果和手机型号">${esc(state.feedbackText)}</textarea>
        <p class="fb-count" id="feedback-text-count">${state.feedbackText.length}/1000</p>
        <input class="fb-input" id="feedback-contact" maxlength="200" placeholder="联系方式（可选）" value="${esc(state.feedbackContact)}">
        <p class="fb-count" id="feedback-contact-count">${state.feedbackContact.length}/200</p>
        <button class="fb-submit" data-action="submit-feedback">提交反馈</button>
      </div>
    </div>`;
  }
  /* —— 第一个会员购买页（appPurchasePage / appScreen='purchase'，2026-09-28 新增时叫「商品购买页」）——
     **2026-10-06 按需求整页删除**（函数本体、APP_PAGES 的 purchase 条目、appScreens 集合、路由、
     guide-purchase 皮肤类、purchase-close 动作与 styles/theme 两组 .pu-* 样式一并删净，勿再补回）。
     它原先的三处入口（「我的」·「账户」组「会员中心」行 / 主 App 额度不足 / 键盘安卓·鸿蒙跳转）
     现在全部落到**「会员购买页 · 新」**（purchase2-copy / appPurchasePlusCopyPage，见下一节）——
     改落点见 gotoAppPurchase、generate 的额度不足分支与 action 的 app-membership / app-membership-plus。
     商品表 PLANS 与选中态 state.kbPlan 未随本页删除：键盘会员开通层（kb-paywall）仍在用它们。 */
  /* —— 主 App ·「会员购买页 · 新」（appPurchasePlusCopyPage，2026-10-06 新增；appScreen='purchase2-copy'）——
     **原第二个会员购买页（appPurchasePlusPage / appScreen='purchase2'，原页名「会员购买页 · 新」）的拷贝**
     （**原页已于 2026-10-06 按需求整页删除**，本页是这一版设计的留存；勿再补回原页；
     **同日晚些需求本页由「会员购买页 · 新2」改回「会员购买页 · 新」这个名字**）：
     下面这段 DOM、商品（PLUS_PLANS + state.pu2Plan —— 原页用同一张表与同一个选中态，现在由本页独享）、
     动作（p2-plan / p2-agree / p2-buy / p2-redeem / p2-close）与样式（theme.css 的 .pu2-* 一组皮肤）
     与原页逐行一致，**只有路由与入口不同**：
     **2026-10-06 需求起档位卡视觉分头**：卡挂 .pu2-plan-v2 修饰类 —— 右端「立减 ¥xx」胶囊去掉、
     现价移到卡右端并在其下挂划线原价、原价格后面的灰标语左移到档位名下面（皮肤仍是 .pu2-* 一组，
     三个修饰类见 theme.css）—— 其余部分仍与它逐行一致。
     **2026-10-06 晚些需求的按钮改版两页一起生效**（用户需求原话「把这些更改同步变更到 会员购买页 · 新2」）：
     本页按钮与它**同一支** —— 不再显示价格与划线价，只剩居中「立即解锁」+ 右上角红角标（随档位变的
     plan.badge；.pu2-cta-origin / .pu2-cta-price 两个 span 两页都不再渲染，theme.css 里那两条已删）；
     档位表也是共用的 —— 周档改价（¥9.9 / 划价 ¥48）与红角标文案都两页一起生效，见 PLUS_PLANS 注释。
     原页在世时两页的分头只有**档位卡视觉**这一处（本页挂 .pu2-plan-v2）。
    **2026-10-06 晚些需求起本页独占的几处演进**（原页已删，都只落本页）：档位名右侧促销胶囊
    **2026-10-06 再晚些需求起只有永久档挂**「低至0.01元/日」黄色一枚（原「三档都挂」口径收回，
    季度 / 周的两枚已删，见 PLUS_PLANS 注释）、
    蓝角标「x%的用户选择」改**右对齐**、划线原价与上方现价**居中对齐**、默认选中档位改**永久会员**、
    购买前新增**协议确认框**（pu2AskSheet + state.pu2Ask）—— 未勾选协议点「立即解锁」弹框、
    切换档位卡直接弹框，点「同意」= 勾上协议 + 立即调起支付（iOS 表现为弹 iOS 系统支付框；
    **再晚些需求照新样式简化**：标题与说明删掉，只剩一句「我已阅读并同意《…》《…》」+ 取消 / 同意）。
     入口 —— **2026-10-06 起主 App 的购买都落这一页**：①「我的」页的会员卡片（会员横幅右侧白胶囊，
     app-membership-plus 动作，未登录先由 needLogin 拦到登录页）；②「账户」组的「会员中心」行
     （app-membership 动作，同样先拦登录 —— 这一行原先落第一个购买页、同日随该页删除改落本页）；
     ③ 主 App 内额度不足发起生成被拦（generate）；④ 键盘安卓 / 鸿蒙点「立即解锁」（gotoAppPurchase）。
     也能从工作台右栏「页面列表」点入（APP_PAGES 的 purchase2-copy 条目 → setupPage →
     openAppScreen("purchase2-copy")；进页摆成默认态：支付渠道回首选支付宝、档位回永久会员、
     协议勾选框回未勾选、协议确认框收起，见 openAppScreen）。
     底部那枚「兑换码」白胶囊（p2-redeem）**2026-10-06 需求起弹半屏的
     「兑换码」弹层**（redeemSheet / state.redeemSheet，见其函数头注释；原「即将开放」轻提示作废）。
    **2026-10-06 需求：iOS 布局与安卓 / 鸿蒙对齐**（用户反馈「iOS 的会员购买页布局与安卓不同步，
    虽然 iOS 会少支付渠道和兑换码，但其他地方的元素大小、布局应当保持一致」）——
    支付方式行与兑换码胶囊**三端渲染同一份 DOM**，iOS 上由 theme.css 置成**不可见占位**
    （.phone[data-platform="ios"] .pu2-page 两条：.pu2-pay / .pu2-redeem；与「Android 不渲染
    键盘底栏、改用等高留白」同一套做法），把它们的高度留在原位 —— 档位卡 / 续订说明 / 主按钮 /
    协议行的尺寸与纵向节奏因此与安卓 / 鸿蒙逐像素一致（此前 iOS 直接不渲染这两块，省下的约 84px
    被卡组吸收：卡片更高、三张卡在卡组内居中被推离标题，页面下半截整体错位）。
     **拷贝的口径**（第一页那张拷贝「会员购买2」purchase-copy 已按 2026-10-06 需求整页删除，
     勿再补回）：两页从这里开始**各自演进** ——
     改动本页不动别的页（原页已按需求删除、勿再补回，也别把两条当重复代码合并 / 删掉）；
     页面本身的结构、纵向节奏与尺寸口径原先记在 appPurchasePlusPage 的头注释里、已随原页一并删除，
     尺寸明细现在看 theme.css 的 .pu2-* 一组与 README 组件表的「会员购买页 · 新」行。
    **2026-10-06 更晚些需求（本轮）两件事**：
     ① **三档改价**：永久 ¥128/¥218 → ¥168/¥840、季度 ¥98/¥128 → ¥88/¥148、周档现价不动、
        划价 ¥48 → ¥28（只改共用表 PLUS_PLANS）；领过「永久会员立减优惠」时永久档现价按
        offerPrice() 取 128（划线原价仍 840）；
     ② **新增「永久会员立减优惠」挽留弹窗**（pu2OfferSheet / state.pu2Offer，详见其函数头注释）：
            点本页出口（左上角叉号 p2-close / Esc 同一条，见 leavePurchasePage）命中弹窗条件时
            不退出、改弹这一层（3 分钟倒计时；「领取优惠」= 记下优惠 + 直接进入支付；
            弹窗 x = 放弃优惠 + 退出）—— **2026-10-06 再改一次条件：首启引导必弹，
            其余情况随机 1/4 命中才弹，当天已弹过一律不弹（跨天自然恢复）**。
    **2026-10-06 本轮需求**：根节点按 state.pu2Enter 挂 `.entering` —— 「打开 App 落到首页、
       等 1 秒自动弹付费墙」那次（launchPaywall）整页**从底部滑入**（styles.css 的
       `.pu2-page.entering`，.3s）；手动入口进本页不带这个类，行为与原来逐项一致。 */
  function appPurchasePlusCopyPage() {
    const plan = PLUS_PLANS[state.pu2Plan] || PLUS_PLANS.quarter;
    /* 三张套餐卡：**2026-10-06 需求起视觉分头**（卡挂 .pu2-plan-v2 修饰类，皮肤仍是 .pu2-* 那组）——
       ① 右端「立减 ¥xx」胶囊整枚去掉；② 现价移到卡片**右端**、下方挂划线原价（.pu2-plan-right +
       .pu2-plan-origin）；③ 原价格后面的灰标语**左移**、退到档位名下面一行（.pu2-plan-sub）。
       **2026-10-06 晚些需求又收回**：④ 促销胶囊只有永久档渲染（黄色「低至0.01元/日」）——
       原「三档都渲染、非永久档按 promoTone 挂 .silver / .copper」的口径整体删除
       （theme.css 的两条修饰类随之删掉）。
       原页已按需求整页删除、勿再补回 —— 这些修饰类只服务本页，见 theme.css 的 .pu2-plan-v2 一组。
       **2026-10-06 再晚些需求（本轮）**：现价按 offerPrice() 取 —— 领过「永久会员立减优惠」
       （offerActive，见 pu2OfferSheet）时永久档按立减 40 后的 128 显示，划线原价仍取 origin；
       三档表价同时更新（永久 168/840、季度 88/148、周划价 28，见 PLUS_PLANS 注释）。 */
    const cards = Object.entries(PLUS_PLANS).map(([id,p])=>`<button type="button" class="pu2-plan pu2-plan-v2${state.pu2Plan===id?' active':''}" data-action="p2-plan:${id}" aria-pressed="${state.pu2Plan===id}">
      <span class="pu2-plan-badge">${esc(p.cardBadge || '')}</span>
      <span class="pu2-plan-main">
        <span class="pu2-plan-name">${esc(p.name)}${p.promo?`<i class="pu2-plan-promo">${esc(p.promo)}</i>`:''}</span>
        ${p.sub?`<span class="pu2-plan-sub">${esc(p.sub)}</span>`:''}
      </span>
      <span class="pu2-plan-right">
        <span class="pu2-plan-price"><i>¥</i>${esc(offerPrice(id))}</span>
        <span class="pu2-plan-origin">¥${esc(p.origin)}</span>
      </span>
    </button>`).join('');
    const cap = state.pu2Plan==='permanent' ? '一次性买断，永久有效，无需续订'
      : `到期后 ¥${plan.price}/${state.pu2Plan==='week'?'周':'季度'}续订，可随时取消`;
    const channel = state.purchasePay==='wechat' ? 'wechat' : 'alipay';
    /* 支付方式行：**2026-10-06 需求起三端渲染同一份 DOM** —— iOS 上照旧不摆这一行内容
       （Apple 内购走系统支付框，见 state.purchasePay 注释），但**保留它的占位高度**：
       theme.css 把这一行在 iOS 上置成不可见（.phone[data-platform="ios"] .pu2-pay 一条，
       与「Android 不渲染键盘底栏、改用等高留白」同一套做法）。原先 iOS 直接不渲染，
       省下的高度被卡组吸收、页面下半截整体错位 —— 用户反馈「iOS 布局与安卓不同步」。 */
    const pay = `<button type="button" class="pu2-pay" data-action="purchase-pay" aria-label="切换支付方式（当前${channel==='alipay'?'支付宝':'微信支付'}）"><span class="pu2-pay-logo" aria-hidden="true"><img src="assets/${channel==='alipay'?'支付宝支付.png':'微信支付.png'}" alt=""></span><span class="pu2-pay-name">${channel==='alipay'?'支付宝':'微信支付'}</span><i class="pu2-pay-switch" aria-hidden="true">${icon('Switch')}</i></button>`;
    const legalLink = (key,label)=>`<button type="button" class="pu2-legal-link" data-action="kb-legal:${key}">${esc(label)}</button>`;
    const renewing = state.pu2Plan!=='permanent' && (state.platform==='ios' || channel==='alipay');
    const agreed = state.pu2Agreed;
    /* 支付按钮：**2026-10-06 晚些需求按「会员购买页 · 新」同步改版** —— 不再显示价格与划线价
       （.pu2-cta-origin / .pu2-cta-price 两个 span 两页都不再渲染，theme.css 里那两条随之删除），
       只剩居中的「立即解锁」；右上角一枚红角标，文案随档位变 = 该档 badge（永久「一次性买断」/
       季度「畅享 90 天」/ 周「畅享 7 天」）—— 样式走共用皮肤，见 theme.css 的 .pu2-cta-badge */
    const cta = `<button type="button" class="pu2-cta" data-action="p2-buy" ${state.paymentBusy?'disabled':''}><span class="pu2-cta-label">立即解锁</span><span class="pu2-cta-badge">${esc(plan.badge || '')}</span></button>`;
    return `<div class="pu2-page${state.pu2Enter?' entering':''}">
      <button type="button" class="pu2-close" data-action="p2-close" aria-label="关闭会员购买页">${icon('Close')}</button>
      <h2 class="pu2-title">成为<b>LoveCo会员</b>，解锁无限次AI使用</h2>
      <div class="pu2-plans">${cards}</div>
      <p class="pu2-cap">${esc(cap)}</p>
      ${pay}
      <div class="pu2-foot">
        <button type="button" class="pu2-redeem" data-action="p2-redeem">兑换码</button>
        ${cta}
        <p class="pu2-consent"><button type="button" class="pu2-check${agreed?' on':''}" data-action="p2-agree" role="checkbox" aria-checked="${agreed}" aria-label="同意协议">${agreed?icon('Check'):''}</button><span class="pu2-consent-text">我已阅读并同意${renewing?legalLink('renewal','《自动续费协议》'):''}${legalLink('membership','《会员协议》')}</span></p>
      </div>
    </div>`;
  }
  /* —— 「邀请有礼」页（appInvitePage，2026-10-05 新增；appScreen='invite'，入口在「我的」·「账户」组）——
     一条**双方各得**的邀请链路 + 阶梯奖励：
     ① **被邀请方**：在本页填写好友的邀请码，校验通过立即获得 3 天会员（grantInviteDays）；
     ② **邀请方**：好友填写邀请码并**首次使用任意 AI 功能**后，邀请人得 3 天 / 人 ——
        记录先落「奖励待激活」（pending），好友用过 AI 才转「已到账」（active）；
        「待激活 → 已到账」的推进在原型里由左栏「模拟 › 模拟好友使用AI」触发（见 simInviteUse）；
     ③ **阶梯奖励**：累计成功邀请满 3 / 5 人，再额外得 7 / 15 天（达标自动到账、可叠加）；
     ④ 活动规则默认只露前 3 条，点「展开全部规则」看全（invite-rules 动作）。
     校验链（invite-claim 动作，顺序即优先级）：空 → 格式（6 位字母或数字，输入时自动转大写）
     → 自己的码 → 已领取过 → 无效码 → 通过。「无效」在原型里的仿真约定：码落在 INVITE_DEAD_CODES
     里即报「无效或已过期」（真机口径是服务端查无此码 / 活动已结束；LC0000 专供演示这一态）。
     页面保留底部 Tab（高亮「我的」）、跟随深色外观 —— 走通用浅灰画布 + 白卡，不另开按图定色皮肤。 */
  const INVITE_DAYS = 3;
  /* 演示「邀请码无效」的仿真码（原型约定，真机上由服务端判定「查无此码 / 已过期」） */
  const INVITE_DEAD_CODES = ['LC0000'];
  /* 阶梯奖励档位：per=true 那条是基础奖励（每位成功邀请 +3 天），其余是达标后额外发放的档位 */
  const INVITE_STEPS = [{n:1,days:3,per:true},{n:3,days:7},{n:5,days:15}];
  /* 左栏「模拟好友使用AI」在没有待激活好友时，按顺序补的模拟好友（只有掩码手机号 ——
     好友侧没有头像与昵称，见 state 顶部说明） */
  const SIM_INVITE_PHONES = ['136****9090','135****1717','188****5252'];
  const INVITE_ERRORS = {
    empty:'请输入邀请码',
    format:'邀请码格式不正确，应为 6 位字母或数字',
    self:'不能填写自己的邀请码',
    used:'你已使用过邀请码，每人仅限一次',
    invalid:'邀请码无效或已过期，请检查后重试',
  };
  /* 可复制的邀请文案（自动带上本人的专属邀请码；换文案只改这一处） */
  const inviteMessage = code => `我在用 LoveCo 键盘，AI 帮我回复聊天超省心！复制这段文字打开 LoveCo，填写我的邀请码 ${code}，你我各得 ${INVITE_DAYS} 天会员。`;
  /* 活动规则（页面规则区渲染；第 3 条的档位 / 天数从 INVITE_STEPS 生成，与奖励发放口径同源） */
  const INVITE_RULES = [
    `活动期间，新用户填写好友的邀请码，立即获得 ${INVITE_DAYS} 天会员权益；每位新用户仅可填写一次邀请码。`,
    `好友首次使用任意 AI 功能（分析聊天、生成回复、语音追问等）后，邀请人获得 ${INVITE_DAYS} 天会员权益 —— 每成功邀请 1 位好友得 ${INVITE_DAYS} 天，奖励自动到账、无需手动领取。`,
    `阶梯奖励：累计成功邀请 ${INVITE_STEPS.slice(1).map(s=>`${s.n} 位`).join(' / ')}好友，邀请人额外获得 ${INVITE_STEPS.slice(1).map(s=>`${s.days} 天`).join(' / ')}会员权益，达标即自动到账、可与基础奖励叠加。`,
    '邀请码仅限本人使用，不可填写自己的邀请码；邀请关系一经绑定不可更换、不可解绑。',
    '邀请所得会员权益在原有效期基础上顺延；已是永久会员时不再重复叠加。',
    '同一设备、同一账号或通过非正常手段（如批量注册、虚假账号）产生的邀请不计入奖励，LoveCo 有权撤销违规所得权益。',
    '本活动的最终解释权归 LoveCo 所有。',
  ];
  /* 已到账人数（阶梯进度与「已到账 N 人」的口径都按它：奖励真到账的才计数） */
  const inviteActiveCount = () => state.inviteFriends.filter(f=>f.status==='active').length;
  /* 邀请奖励的会员到账（本页三处用：被邀请方领码 / 邀请方好友到账 / 阶梯奖励）——
     非会员从此刻起算 N 天；有效会员在原到期日上顺延 N 天；永久会员不再叠加（返回 false）。
     与购买链路的 completePurchase 不同：那边是「买多少算多少」（覆盖到期日），这里是在现有权益上累加。 */
  function grantInviteDays(days) {
    if(state.member && state.memberExpiry===0)return false;
    const base = state.member && state.memberExpiry>0 ? state.memberExpiry : Date.now();
    state.member=true;
    state.memberExpiry=base+days*86400000;
    return true;
  }
  function appInvitePage() {
    const active = inviteActiveCount();
    /* 填写区：领过就换成成功态（不再显示输入框 —— 每人仅限一次，used 校验在动作层只做兜底） */
    const claimed = state.inviteClaim;
    const claimBlock = claimed
      ? `<div class="iv-claim-done"><i class="iv-done-ico" aria-hidden="true">${icon('CircleCheck')}</i><span class="iv-done-text"><strong>${INVITE_DAYS} 天会员已到账</strong><small>已使用好友邀请码 ${esc(claimed.code)} · ${esc(state.memberExpiry===0?'你已是永久会员，权益不再叠加':memberBadgeText())}</small></span></div>`
      : `<p class="iv-card-sub">填写好友的邀请码，立即得 ${INVITE_DAYS} 天会员</p>
        <div class="iv-claim-row${state.inviteError?' err':''}">
          <input class="iv-claim-input" id="invite-code" maxlength="6" autocomplete="off" spellcheck="false" placeholder="请输入 6 位邀请码" value="${esc(state.inviteDraft)}">
          <button type="button" class="iv-claim-btn" data-action="invite-claim">领取</button>
        </div>
        ${state.inviteError?`<p class="iv-claim-error" role="alert">${icon('Warning')}${esc(INVITE_ERRORS[state.inviteError]||'')}</p>`:''}`;
    /* 阶梯进度：进度条按最高档（5 人）折算；三档节点达成后转品牌色 */
    const nextStep = INVITE_STEPS.find(s=>active<s.n);
    const tip = nextStep
      ? `再成功邀请 <b>${nextStep.n-active}</b> 位好友（好友首次使用 AI 后自动到账），额外得 <b>${nextStep.days}</b> 天会员`
      : '阶梯奖励已全部解锁，每成功邀请 1 位好友仍可得 3 天会员';
    const steps = INVITE_STEPS.map(s=>`<div class="iv-step${active>=s.n?' done':''}"><b>${s.n} 人</b><small>+${s.days} 天${s.per?'/人':''}</small></div>`).join('');
    /* 邀请记录只有手机号可显示：好友侧没有头像与昵称，主文字就是掩码手机号 */
    const friendRow = f => `<div class="iv-friend">
      <span class="iv-friend-phone">${esc(f.phone)}</span>
      <span class="iv-tag ${f.status==='active'?'done':'wait'}">${f.status==='active'?`已到账 +${f.days} 天`:'待激活'}</span>
    </div>`;
    const rules = INVITE_RULES.map(r=>`<li>${esc(r)}</li>`);
    const shownRules = state.inviteRulesOpen ? rules : rules.slice(0,3);
    return `<div class="app-content app-page invite-page">
      <div class="app-page-head user-head">
        <button class="user-back" data-action="invite-back" aria-label="返回">${icon('ArrowLeft')}</button>
        <h2>邀请有礼</h2>
        <span class="user-head-side" aria-hidden="true"></span>
      </div>
      <section class="iv-hero">
        <h3 class="iv-hero-title">邀请好友，各得 ${INVITE_DAYS} 天会员</h3>
        <p class="iv-hero-sub">好友填写你的邀请码并首次使用 AI 后，你们各得 ${INVITE_DAYS} 天会员</p>
        <div class="iv-code-card">
          <span class="iv-code-label">我的专属邀请码</span>
          <span class="iv-code-row">
            <strong class="iv-code">${esc(state.inviteCode)}</strong>
            <button type="button" class="iv-copy-code" data-action="invite-copy:code">${state.inviteCopied==='code'?'已复制':'复制邀请码'}</button>
          </span>
        </div>
        <button type="button" class="iv-copy-msg" data-action="invite-copy:msg">${state.inviteCopied==='msg'?'邀请文案已复制':'复制邀请文案'}</button>
      </section>
      <section class="app-card iv-card">
        <h3 class="iv-card-title">填写邀请码</h3>
        ${claimBlock}
      </section>
      <section class="app-card iv-card">
        <div class="iv-card-head"><h3 class="iv-card-title">我的邀请</h3><span class="iv-count">已到账 ${active} 人</span></div>
        <div class="iv-ladder">
          <div class="iv-ladder-bar"><i style="width:${Math.min(100,Math.round(active/INVITE_STEPS[INVITE_STEPS.length-1].n*100))}%"></i></div>
          <div class="iv-ladder-steps">${steps}</div>
        </div>
        <p class="iv-ladder-tip">${tip}</p>
        ${state.inviteFriends.length
          ? `<div class="iv-friends">${state.inviteFriends.map(friendRow).join('')}</div><p class="iv-friends-note">好友首次使用任意 AI 功能后，奖励自动到账</p>`
          : '<p class="iv-empty">还没有邀请记录，把邀请码发给好友吧</p>'}
      </section>
      <section class="app-card iv-card">
        <h3 class="iv-card-title">活动规则</h3>
        <ol class="iv-rules">${shownRules.join('')}</ol>
        <button type="button" class="iv-rules-toggle" data-action="invite-rules">${state.inviteRulesOpen?'收起':'展开全部规则'}</button>
      </section>
    </div>`;
  }
  /* 「邀请有礼」页填写框的接线（渲染后挂）：
     输入即时回存 state 草稿（重渲染不丢），自动转大写并滤掉字母数字以外的字符（邀请码口径 6 位）；
     重新输入时清掉上一次的校验提示（就地改 DOM，不整页重渲染 —— 输入焦点与光标不跳）；
     回车 = 点「领取」。与「问题反馈」页同一口径：字段草稿显式存在 state 里，不走 formCache。 */
  function bindInvitePage() {
    const node = $('#invite-code');
    if(!node)return;
    const sync = () => {
      const v = node.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);
      if(v!==node.value)node.value=v;
      state.inviteDraft = v;
      if(state.inviteError){
        state.inviteError='';
        $('.iv-claim-error')?.remove();
        $('.iv-claim-row')?.classList.remove('err');
      }
    };
    node.addEventListener('input',sync);
    node.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();action('invite-claim');}});
  }
  /* 「兑换码」弹层输入框的接线（渲染后挂，与上面 bindInvitePage 同一套做法）：
     输入即时回存草稿、自动转大写并滤掉字母数字以外的字符（兑换码口径 4-12 位、上限 12），
     并同步「立即兑换」的可用态（空输入时置灰不可点）；
     重新输入时清掉上一次的校验提示（就地改 DOM，不整页重渲染 —— 焦点与光标不跳）；
     回车 = 点「立即兑换」（空输入不提交）。 */
  function bindRedeemSheet() {
    const node = $('#redeem-code');
    if(!node)return;
    const cta = $('.rd-cta');
    const sync = () => {
      const v = node.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,12);
      if(v!==node.value)node.value=v;
      state.redeemDraft = v;
      if(cta)cta.disabled = !v;
      if(state.redeemError){
        state.redeemError='';
        $('.rd-error')?.remove();
        node.classList.remove('err');
      }
    };
    node.addEventListener('input',sync);
    node.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();if(state.redeemDraft)action('redeem-submit');}});
  }
  /* 左栏「模拟 › 模拟好友使用AI」按一下发生一件事（与「模拟截屏」同一类按钮，只在主 App 形态渲染）：
     ① 有「待激活」好友 → 把最早那位置为「已到账」（= 该好友首次使用了 AI 的仿真）；
     ② 没有待激活好友 → 新加一条已到账记录（模拟又邀到一位，手机号按 SIM_INVITE_PHONES 轮换）；
     随后按到账人数补发阶梯奖励（满 3 / 5 人档，发过的档位记在 inviteStepsClaimed、不重复发），
     全量落库并弹一记回执。它只推进「我作为邀请方」那半条链路 ——
     被邀请方那半边走页面里的填写区（invite-claim）。 */
  function simInviteUse() {
    const pending = state.inviteFriends.find(f=>f.status==='pending');
    let who;
    if(pending){pending.status='active';who=pending.phone;}
    else {
      /* 手机号按「预置两条之后又补了几条」轮换（不直接用数组长度，否则第一条会跳过表头） */
      const phone=SIM_INVITE_PHONES[Math.max(0,state.inviteFriends.length-2) % SIM_INVITE_PHONES.length];
      who=phone;
      state.inviteFriends.push({id:'iv'+Date.now(),phone,status:'active',days:INVITE_DAYS});
    }
    const ok = grantInviteDays(INVITE_DAYS);
    const active = inviteActiveCount();
    const bonus = [];
    INVITE_STEPS.filter(s=>!s.per && active>=s.n && !state.inviteStepsClaimed.includes(s.n)).forEach(s=>{
      state.inviteStepsClaimed.push(s.n);
      if(grantInviteDays(s.days))bonus.push(s.days);
    });
    persist();
    if(!ok&&!bonus.length)return showToast(`好友「${who}」已使用 AI（你已是永久会员，奖励不再叠加）`);
    showToast(bonus.length
      ? `好友「${who}」已使用 AI：邀请 +${INVITE_DAYS} 天、阶梯奖励 +${bonus.join('、+')} 天已到账`
      : `好友「${who}」已使用 AI，邀请奖励 +${INVITE_DAYS} 天已到账`);
  }
  /* —— 首次登录后的「资料引导」（2026-09-28 需求，主 App 的整页流程）——
     第一次登录成功（一键登录 / 短信登录）收起登录层那一刻**接着走这两步**，走完才进首页：
     ① **选择性别**：**不可跳过** —— 页面上没有「跳过」，两颗白卡二选一，卡上是 ♂ / ♀ 两个
        符号图形（按需求用符号代替原来的插画头像）；没选时底部箭头置灰，选中才亮；
     ② **你的出生日期**：**可跳过** —— 三列滚轮（年 / 月 / 日）停在中线那一行，下面实时算出
        「N岁  星座」；点「跳过」不带生日结束，点箭头才把生日写进 state.birthday。
     「性别有没有设置」由左栏「模拟 › 已设置性别」仿真开关表示（关 = 还没设置）：走完（或跳过
     出生日期）自动置成开，再登录不再出现这两页 —— 想再看一遍把开关关掉即可（见 state.genderSet）。
     **首启引导期间无条件走这两页**，且**性别那一步不可跳过** —— 所以在性别页上主动退出 App、
     没走完时开关仍关着，下次登录会再检查一次性别、把这两页弹出来。
     两步都是整页（无底部 Tab，状态栏连着一起转淡紫 —— .guide-lavender，样式见 theme.css 的
     .onb-* 一组）；它是**主 App 的页面**（键盘形态没有这一页）—— 从键盘里登录进来也切到主 App
     走完再回（startOnboarding）。 */
  /* 滚轮一行的高度（px）：CSS 的 scroll-snap 与「停在哪一行」都按它算（见 bindWheelCols） */
  const ONB_ROW = 44;
  const ONB_YEARS = Array.from({length:36},(_,i)=>1980+i);
  const ONB_MONTHS = Array.from({length:12},(_,i)=>i+1);
  const ONB_DAYS = Array.from({length:31},(_,i)=>i+1);
  function onboardDayMax(y,m){ return m===2 ? ((y%4===0&&y%100!==0)||y%400===0?29:28) : [4,6,9,11].includes(m)?30:31; }
  /* 星座：按月 / 日落在哪一段（设计图 2006-09-28 → 天秤座）—— 从后往前找第一个「起始月日 ≤ 这天」的
     星座，1 月 1–19 日落在最后一段（摩羯座） */
  const ZODIACS = [[1,20,'水瓶座'],[2,19,'双鱼座'],[3,21,'白羊座'],[4,20,'金牛座'],[5,21,'双子座'],[6,22,'巨蟹座'],
    [7,23,'狮子座'],[8,23,'处女座'],[9,23,'天秤座'],[10,24,'天蝎座'],[11,23,'射手座'],[12,22,'摩羯座']];
  function zodiacOf(m,d){
    for(let i=ZODIACS.length-1;i>=0;i--){const [mm,dd,name]=ZODIACS[i];if(m>mm||(m===mm&&d>=dd))return name;}
    return '摩羯座';
  }
  function ageFrom(y,m,d){
    const now=new Date(); let age=now.getFullYear()-y;
    if(now.getMonth()+1<m||(now.getMonth()+1===m&&now.getDate()<d))age--;
    return Math.max(age,0);
  }
  /* 滚轮上停着的那天：日按当月天数收紧（2 月 30 日按 2 月 28 / 29 日算） */
  function onboardPicked(){
    const p=state.onboardPick||{y:2006,m:9,d:28};
    return {y:p.y,m:p.m,d:Math.min(p.d,onboardDayMax(p.y,p.m))};
  }
  function onboardMetaText(){
    const {y,m,d}=onboardPicked();
    return `<span>${ageFrom(y,m,d)}岁</span><span>${zodiacOf(m,d)}</span>`;
  }
  /* 性别符号（按需求用 ♂ / ♀ 代替插画头像）：粗圆头描边 + 渐变描边色 ——
     ♂ = 圆 + 指向右上（↗）的箭头、♀ = 圆 + 下方十字；男走蓝紫渐变、女走粉红渐变 */
  function onboardGlyph(kind){
    const [id,a,b] = kind==='男' ? ['onb-gm','#7C8CFF','#4B57E6'] : ['onb-gf','#FFA8C4','#F4558C'];
    const shape = kind==='男'
      ? `<circle cx="40" cy="62" r="24"/><path d="M57 45 L86 16"/><path d="M86 16 H64"/><path d="M86 16 V38"/>`
      : `<circle cx="50" cy="40" r="23"/><path d="M50 63 V92"/><path d="M34 76 H66"/>`;
    /* 渐变坐标用 userSpaceOnUse：默认的 objectBoundingBox 对纯竖 / 纯横的线（♀ 的竖杆与横杠、
       ♂ 箭头的竖向小枝）会算出零宽的包围盒，描边整个画不出来 */
    return `<svg class="onb-glyph" viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="14" y1="96" x2="92" y2="10"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><g fill="none" stroke="url(#${id})" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round">${shape}</g></svg>`;
  }
  /* 出生日期那一步的蛋糕插画（照设计图：粉色托盘 + 两层蓝蛋糕 + 奶油波浪 + 一根点着的蜡烛） */
  function onboardCake(){
    return `<svg class="onb-cake" viewBox="0 0 120 120" aria-hidden="true">
      <ellipse cx="60" cy="104" rx="46" ry="9" fill="#FFB6C8"/><rect x="14" y="96" width="92" height="8" rx="4" fill="#FFC8D6"/>
      <rect x="20" y="68" width="80" height="28" rx="8" fill="#7EA6F5"/><rect x="30" y="50" width="60" height="20" rx="7" fill="#9DBBF9"/>
      <rect x="56" y="26" width="8" height="26" rx="4" fill="#FF9BB5"/>
      <path d="M58.5 30 v8 M58.5 40 v5" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M30 52 q7.5 -10 15 0 t15 0 t15 0 t15 0 v5 H30 z" fill="#FFF3F6"/>
      <path d="M60 8 c7 8 9 12 9 16 a9 9 0 0 1 -18 0 c0 -4 2 -8 9 -16 z" fill="#FFB020"/>
      <path d="M60 17 c3 4 4 6 4 8 a4 4 0 0 1 -8 0 c0 -2 1 -4 4 -8 z" fill="#FFF0A8"/></svg>`;
  }
  /* 分页圆点：**三个**（设计图是三步的资料页），当前这一步深色 —— 目前只做前两步（性别 / 出生日期） */
  function onboardDots(step){
    const cur = step==='birthday' ? 1 : 0;
    return `<div class="onb-dots">${[0,1,2].map(i=>`<i class="${i===cur?'on':''}"></i>`).join('')}</div>`;
  }
  function onboardGenderPage(){
    const g=state.gender, picked=g==='男'||g==='女';
    const card=label=>`<button class="onb-card${g===label?' on':''}" data-action="onboard-gender:${label}" aria-pressed="${g===label}"><span class="onb-card-box">${onboardGlyph(label)}</span><span class="onb-card-label">${label}</span></button>`;
    return `<div class="onb-page">
      <div class="onb-top"><span class="onb-top-side" aria-hidden="true"></span>${onboardDots('gender')}<span class="onb-top-side" aria-hidden="true"></span></div>
      <h1 class="onb-title">选择性别</h1>
      <div class="onb-cards">${card('男')}${card('女')}</div>
      <button class="onb-next" data-action="onboard-next" aria-label="下一步"${picked?'':' disabled'}>${icon('ArrowRight')}</button>
    </div>`;
  }
  function onboardBirthdayPage(){
    const p=onboardPicked();
    const col=(key,list,fmt,cur)=>`<div class="onb-col" data-col="${key}">${list.map(v=>`<button class="onb-row${v===cur?' on':''}" data-v="${v}" type="button">${fmt(v)}</button>`).join('')}</div>`;
    return `<div class="onb-page">
      <div class="onb-top">
        <button class="onb-back" data-action="onboard-back" aria-label="返回">${icon('ArrowLeft')}</button>
        ${onboardDots('birthday')}
        <button class="onb-skip" data-action="onboard-skip">跳过</button>
      </div>
      ${onboardCake()}
      <h1 class="onb-title">你的出生日期</h1>
      <div class="onb-wheel">
        ${col('y',ONB_YEARS,v=>v+'年',p.y)}${col('m',ONB_MONTHS,v=>v+'月',p.m)}${col('d',ONB_DAYS,v=>v+'日',p.d)}
      </div>
      <p class="onb-meta" id="onb-meta">${onboardMetaText()}</p>
      <button class="onb-next" data-action="onboard-next" aria-label="完成">${icon('ArrowRight')}</button>
    </div>`;
  }
  function appOnboardPage(){ return state.onboarding==='birthday' ? onboardBirthdayPage() : onboardGenderPage(); }
  /* 开始 / 收尾（入口：finishKbLogin；动作：onboard-gender / onboard-next / onboard-back / onboard-skip） */
  function startOnboarding(step){
    state.onboarding = step || 'gender';
    /* 资料引导是主 App 的整页（键盘形态没有这一页）：从键盘里登录进来也切到主 App 走完 */
    openAppScreen('onboard');
  }
  function finishOnboarding(birthday){
    if(birthday){
      state.birthday=birthday;
      const {y,m,d}=onboardPicked(), band=ageBand(ageFrom(y,m,d));
      if(band)state.age=band;
    }
    /* 走完（或跳过出生日期）= 性别已经设置好了：把左栏「模拟 › 已设置性别」开关自动置成**开**
       （性别那一步**不可跳过**，走到这儿必然已经选过 —— 这里照 `state.gender` 再确认一次），
       落库 —— 之后登录不再出现这两页；想再看一遍把开关关掉即可。
       反过来，首启期间在性别页上主动退出 App、没走到这儿时，开关就一直留在关着 ——
       **下次登录会照着它再检查一次性别**，没设置就把这两页再弹出来（见 finishKbLogin）。 */
    state.genderSet = state.gender==='男'||state.gender==='女'; state.onboarding='';
    persist();
    /* 引导链路（切换键盘之后 → 演示之前）：资料引导这一站走完接着开演「键盘使用引导（演示）」——
       演示收场才落首页、才排自动付费墙（2026-10-08 需求，见 closeKbUsageGuide / finishGuide），
       这里先不落首页 */
    if(state.guideDemoPending) return openKbUsageGuide(true);
    /* 资料引导走完 = 打开 App 的引导链路彻底走完 —— 落到首页那一刻排「等 1 秒从底部弹购买页」
       （未开通会员时，见 launchPaywall）。**引导链路（guideDemoPending）在上面那句已经开演演示去了**
       —— 演示收场由 finishGuide 落首页、排这次弹出（2026-10-08 需求把演示挪到链路最后）。
       注意排完先落首页（launchPaywall 现在只排定时器、不再立即切页），1 秒后购买页滑上来。
       **先排再谈首启收尾**（顺序要紧）：2026-10-06 再晚些需求把结束时机往后延了 —— 排上就挂起
       「首启尾巴」，下面那句 clearFirstLaunch 会被它挡下，开关继续亮着，等这一轮付费墙
       （购买页 → 优惠券挽留 → 退出回首页）走完才复位成关（见 finishFirstLaunch）。 */
    launchPaywall();
    /* 资料引导走完 = 首启链路走到最后一站 —— 没排自动付费墙时这儿就是收尾（开关就此关掉） */
    clearFirstLaunch();
    openAppScreen('home');
  }
  /* 年龄分档（18–22 / 23–30 / 31–40 / 40以上）：填生日时顺带把 state.age 对上那一档。
     这个字段是「个人资料」时代的年龄段展示值 —— 该页 2026-10-04 改成「用户」后不再显示
     年龄段（原表单已删），age 只留在存档里，分档口径不变。 */
  function ageBand(age){ return age<18?null:age<=22?'18–22':age<=30?'23–30':age<=40?'31–40':'40以上'; }
  /* 出生日期滚轮（三列）：滚动吸附由 CSS 给（.onb-col 的 scroll-snap），这里负责
     ① 首帧把每列摆到已选的那一行（scrollTop = 行号 × ONB_ROW，不用平滑滚动）；
     ② 滚 / 点行都把停住的那行记进草稿状态，并**就地**刷新下方「N岁 星座」
        （不整页重渲染 —— 重建 DOM 会把滚轮位置弹回，见 render 里的滚动记忆）；
     ③ 首次登录那一步点箭头（onboard-next）才真正落库（见 finishOnboarding）。
     两处共用（rootSel 区分，列骨架都借 .onb-col / .onb-row，别让两个根互相覆盖）：
       · 「你的出生日期」页（资料引导第二步）：'.onb-page' + state.onboardPick + #onb-meta；
       · 「用户」页的出生日期弹层：'.user-wheel' + state.userPick + #user-meta（保存见 save-birthday）。 */
  function bindWheelCols(rootSel, pickKey, metaSel, metaText){
    document.querySelectorAll(`${rootSel} .onb-col`).forEach(col=>{
      const key=col.dataset.col, rows=[...col.querySelectorAll('.onb-row')], pick=state[pickKey];
      if(!rows.length||!pick)return;
      const apply=()=>{
        const i=Math.max(0,Math.min(rows.length-1,Math.round(col.scrollTop/ONB_ROW)));
        const v=Number(rows[i].dataset.v);
        if(v===pick[key])return;
        pick[key]=v;
        rows.forEach((r,ri)=>r.classList.toggle('on',ri===i));
        const meta=$(metaSel); if(meta)meta.innerHTML=metaText();
      };
      const start=Math.max(0,rows.findIndex(r=>Number(r.dataset.v)===pick[key]));
      col.scrollTop=start*ONB_ROW;
      let raf=0;
      col.addEventListener('scroll',()=>{ if(raf)return; raf=requestAnimationFrame(()=>{raf=0;apply();}); },{passive:true});
      rows.forEach((r,i)=>r.addEventListener('click',()=>col.scrollTo({top:i*ONB_ROW,behavior:'smooth'})));
    });
  }
  /* 底部 Tab 栏：首页 / 对象 / 我的。子页保留父 Tab 的选中态（对象的新增 / 编辑算「对象」，
     其余账户类子页算「我的」），登录页不属于任何 Tab，不点亮。 */
  const APP_TABS = [['home','首页','home'],['partners','对象','users'],['account','我的','user']];
  const APP_TAB_OF = {home:'home',partners:'partners','partner-edit':'partners',account:'account',profile:'account',feedback:'account',about:'account','purchase2-copy':'account',invite:'account'};
  function appTabBar() {
    /* 「开启键盘」引导流程、首次登录的「资料引导」、会员购买页（**2026-10-06 起只剩
       「会员购买页 · 新」purchase2-copy 一张**，整页铺满、没有底部 Tab —— 第一个购买页 purchase
       与第二个购买页 purchase2、第一页的拷贝 purchase-copy 都已按需求整页删除，勿再补回）、
       注销账号页（2026-10-04 起整页铺满）、协议正文页（2026-10-04 起整页铺满，
       照设计图只有一枚返回箭头、页尾也没有返回按钮）、       「问题反馈」页（2026-10-04 起整页铺满，
       设计图里没有底部 Tab）、「关于 LoveCo」页（2026-10-04 晚些新增，同设计图没有底部 Tab）
       与两张登录独立页面（「手机号登录」/「一键登录」，
       2026-09-29 起不再是覆盖层）都没有底部 Tab */
    if(state.appScreen==='kb-guide'||state.appScreen==='onboard'||state.appScreen==='purchase2-copy'||state.appScreen==='cancel-account'||state.appScreen==='legal'||state.appScreen==='feedback'||state.appScreen==='about'||state.appScreen==='login'||state.appScreen==='login-one-tap'||state.appScreen==='messages'||state.appScreen==='app-ai')return '';
    const glyph = window.LoveCoSystemGlyphs;
    const active = APP_TAB_OF[state.appScreen] || '';
    return `<nav class="app-nav" role="tablist">${APP_TABS.map(([id,label,g])=>`<button data-action="app-tab:${id}" class="${active===id?'active':''}" aria-selected="${active===id}" role="tab">${glyph[g]}${label}</button>`).join('')}</nav>`;
  }
  /* 主 App 正文：Tab 三页与各整页子页走各自的整页结构（2026-10-04 起不再有 sheet 卡片的子页 ——
     「反馈与建议」本轮也改成整页，renderModal 里最后那张卡片的分支随之撤掉）；
     子页里的整页结构：「用户」（profile，2026-10-04 按设计图重做）→ appUserPage、
     「注销账号」→ appCancelPage、     「协议正文」→ appLegalPage
     （2026-10-04 按需求由覆盖层改回整页；原「协议中心」列表页同日稍晚按需求删除，勿补回）、
     「问题反馈」→ appFeedbackPage（2026-10-04 按设计图从 sheet 卡片重做成深色整页）、
     「关于 LoveCo」→ appAboutPage（2026-10-04 晚些按设计图新增，从「我的」·「更多」进）。 */
  function appScreenContent() {
    const s = state.appScreen;
    /* 「开启键盘」引导流程是主 App 自己的整页：此刻正文整页替换、底部 Tab 栏一并隐藏（见 appTabBar） */
    if(s==='kb-guide')return appKbGuideScreen();
    /* 首次登录后的「资料引导」（选择性别 / 出生日期两步）同样是整页流程 */
    if(s==='onboard')return appOnboardPage();
    if(s==='home')return appHomePage();
    /* 「消息」（2026-10-05 需求）：从首页右上角信封图标进的整页（appMessagesPage，无底部 Tab） */
    if(s==='messages')return appMessagesPage();
    /* 「问AI」（2026-10-06 需求）：首页三处入口都进来的 AI 咨询师聊天整页
       （appAiPage，无底部 Tab；下半是键盘里的问AI页） */
    if(s==='app-ai')return appAiPage();
    if(s==='account')return appAccountPage();
    /* 「用户」（原「个人资料」）：2026-10-04 起也是整页结构（原为 renderModal 里的 sheet 卡片，那份编辑表单已删） */
    if(s==='profile')return appUserPage();
    /* 「会员购买页 · 新」（2026-10-06 新增；**同日起主 App 唯一的会员购买页** —— 第一个购买页
       purchase / appPurchasePage 已按需求整页删除，它的三处入口都改落这一页，见 gotoAppPurchase /
       generate 的额度不足分支 / app-membership）：见 appPurchasePlusCopyPage */
    if(s==='purchase2-copy')return appPurchasePlusCopyPage();
    /* 「注销账号」（2026-10-04 需求）：从「用户」页进的整页（appCancelPage，无底部 Tab） */
    if(s==='cancel-account')return appCancelPage();
    /* 「协议正文」（2026-10-04 需求：原 sheet 覆盖层 → 整页，无底部 Tab；原「协议中心」列表页
       同日稍晚按需求删除） */
    if(s==='legal')return appLegalPage();
    /* 「问题反馈」（2026-10-04 需求：原 sheet 卡片 → 深色整页，无底部 Tab） */
    if(s==='feedback')return appFeedbackPage();
    /* 「关于 LoveCo」（2026-10-04 晚些需求：从纯展示行接上落地页，整页、无底部 Tab） */
    if(s==='about')return appAboutPage();
    /* 「邀请有礼」（2026-10-05 新增：从「我的」·「账户」组进来的整页，保留底部 Tab） */
    if(s==='invite')return appInvitePage();
    /* 登录独立页面（2026-09-29 起不再是覆盖层；同日晚些拆成「手机号登录」/「一键登录」两页）：
       同一套 kb-login 组件整页直出 —— 表单形态由 state.kbLogin 决定（openAppLogin 落页时已摆好），
       X / Esc / 登录成功的收尾见 closeAppLogin / finishKbLogin */
    if(s==='login'||s==='login-one-tap')return LoveCoUI.render('kb-login', uiContext());
    if(s==='partners')return appPartnersPage();
    if(s==='partner-edit')return partnerEditor();
    return renderModal().replace(/^<div class="modal-backdrop">/,'<div class="app-content">').replace(/<\/div>\s*$/,'</div>');
  }
  function renderApp() {
    const ctx = uiContext();
    /* 主 App 形态的「模拟」组只在左栏渲染一处（2026-09-29 起右栏「APP STATE」一节连同它的
       「仿真控制台」入口一起删除）；键盘形态仍是左栏与「仿真控制台」弹层两处同时渲染、
       靠前缀区分控件 id（同一套机制） */
    state.renderedControls=false;
    const content=appScreenContent();
    /* 引导流程的整页皮肤要连着状态栏一起换底色（引导页紫蓝、模拟设置 / 详情页黑、
       安卓设置页浅色、切换到 LoveCo 键盘页蓝），给手机挂上对应 class，状态栏配色在 theme.css 里跟着走 */
    const guideCls = state.appScreen==='kb-guide'
      ? (state.kbGuidePage==='guide' ? ' guide-purple'
        : state.kbGuidePage==='switch' ? ' guide-blue'
        : (state.kbGuidePage==='settings' && state.platform==='android') ? ' guide-light' : ' guide-dark')
      /* 首次登录的「资料引导」连状态栏一起转淡紫（见 theme.css 的 .guide-lavender） */
      : state.appScreen==='onboard' ? ' guide-lavender'
      /* 「会员购买页 · 新」（2026-10-06；第二个购买页 purchase2 与第一个购买页 purchase 同日
         已按需求整页删除）：整页铺满与浅紫皮肤都沿用 .guide-purchase2 */
      : state.appScreen==='purchase2-copy' ? ' guide-purchase2'
      /* 注销账号页整页白底（2026-10-04）：状态栏连着一起转白（.guide-cancel，theme.css） */
      : state.appScreen==='cancel-account' ? ' guide-cancel'
      /* 协议正文页整页白底（2026-10-04 需求：覆盖层改整页）：状态栏同样转白（.guide-legal） */
      : state.appScreen==='legal' ? ' guide-legal'
      /* 「问题反馈」页整页深色（2026-10-04 需求：sheet 卡片改整页）：状态栏连着一起转深色（.guide-feedback） */
      : state.appScreen==='feedback' ? ' guide-feedback'
      /* 首页深色（2026-10-05 按设计图重做）：状态栏连着一起转深色，底部 Tab 栏同时换深色皮肤（.guide-home） */
      : (state.appScreen==='home') ? ' guide-home'
      /* 「消息」页整页浅色（2026-10-05 需求）：状态栏连着一起转白（.guide-msg，theme.css） */
      : (state.appScreen==='messages') ? ' guide-msg'
      /* 「问AI」页整页浅色（2026-10-06 需求）：状态栏连着一起转 #F4F1F8 浅紫灰（.guide-ai，theme.css），
         app-main 由它清零边距、改内部滚动（聊天记录自己滚，键盘贴底） */
      : (state.appScreen==='app-ai') ? ' guide-ai'
      /* 登录整页淡蓝（2026-09-29，「手机号登录」/「一键登录」两页同一套）：状态栏连着一起转淡蓝（.guide-login，theme.css） */
      : (state.appScreen==='login'||state.appScreen==='login-one-tap') ? ' guide-login' : '';
    const scrollMemo = captureScrolls($('#app'));
    $('#app').innerHTML = `<div class="shell app-workspace">
      <header class="topbar"><div class="brand"><img src="assets/brand/LoveCo_108_108.png" alt="LoveCo"><span class="brand-name">LoveCo</span><span class="brand-tag">主 App 手机模拟器</span></div></header>
      <main class="workspace"><aside class="rail left-rail"><div class="rail-section"><div class="rail-heading"><h2>平台与app形态</h2></div>${deviceSwitchers()}</div>${permissionSection()}<div class="rail-section"><div class="rail-heading"><h2>模拟</h2></div>${simControls()}${simShotButton()}</div></aside>
        <section class="device-column"><div class="device-top"><span>${icon('Cellphone')}${platformName()} · 主 App 模式</span><span><i class="dot"></i>${state.loggedIn?'已登录':'未登录'}</span></div><div class="phone app-phone${state.dark?' dark':''}${guideCls}" data-platform="${state.platform}">${LoveCoUI.render('status-bar', ctx)}<div class="app-shell"><main class="app-main">${content}</main>${appTabBar()}${state.kbFullAccess?LoveCoUI.render('kb-full-access', ctx):''}${state.kbPaywall?LoveCoUI.render('kb-paywall', ctx):''}${state.kbLegal?LoveCoUI.render('kb-legal', ctx):''}${state.kbImeSwitch?ieSwitchSheet():''}</div>${state.kbGuideDemo?LoveCoUI.render('kb-usage-guide', ctx):''}${state.shotFlash?'<div class="shot-flash" aria-hidden="true"></div>':''}${voiceHoldOverlay()}${state.offerBadge&&!state.member&&state.appScreen==='home'?offerBadge():''}${state.userSheet?userSheet():''}${state.cancelAsk?cancelAskSheet():''}${state.pu2Ask?pu2AskSheet():''}${state.pu2Offer?pu2OfferSheet():''}${state.redeemSheet?redeemSheet():''}${state.supportSheet?supportSheet():''}${state.iosPaySheet?LoveCoUI.render('ios-pay-sheet', ctx):''}${state.toast?`<div class="app-toast" role="status" aria-live="polite">${esc(state.toast)}</div>`:''}</div><div class="device-caption">LoveCo<span></span>com.gasairea.loveco<span></span>MAIN APP</div>${pageDetail()}<div class="mobile-testbar"><div class="testbar-switchers">${surfaceButtons()}${platformButtons()}</div></div></section><aside class="rail right-rail">${pageListSection()}</aside></main>
    </div>`;
    bind();
    /* 引导流程的演示动画：每次重建 DOM 后重新接一遍「拿到手势就开声音」（见 wireGuideVideos） */
    wireGuideVideos();
    /* 「问题反馈」页两个输入框的草稿回存与实时计数（见 bindFeedbackPage） */
    bindFeedbackPage();
    /* 「邀请有礼」页填写框的草稿回存 / 输入过滤 / 回车提交（见 bindInvitePage） */
    bindInvitePage();
    /* 「兑换码」弹层输入框的草稿回存 / 输入过滤 / 可用态 / 回车提交（见 bindRedeemSheet） */
    bindRedeemSheet();
    /* 「切换到 LoveCo 键盘」页的输入框**进来就是激活态**（2026-09-28 需求：不用先点一下才激活）——
       渲染后把焦点直接交给它（光标在框里闪 = 激活态）；页面上点任何一处也把焦点还回来，
       见 bindKbSwitchPage()（浮层与地球除外）。这一页只有这一个输入框，不会抢谁的焦点。 */
    if (state.appScreen==='kb-guide' && state.kbGuidePage==='switch') {
      $('#kb-switch-input')?.focus({preventScroll:true});
    }
    document.querySelectorAll('.app-content input[id],.app-content textarea[id],.app-content select[id]').forEach(node=>{
      const cacheKey=state.modal+':'+(state.modalData.id||'')+':'+node.id;
      if(node.type==='checkbox'||node.id.startsWith('sim-'))return;
      if(Object.hasOwn(state.formCache,cacheKey))node.value=state.formCache[cacheKey];
      node.addEventListener('input',()=>{state.formCache[cacheKey]=node.value;});
      node.addEventListener('change',()=>{state.formCache[cacheKey]=node.value;});
    });
    /* 键盘对象编辑面板（kb-partner-editor）的输入实时回存 modalData：进出头像选择器、
       保存失败的提示重渲染，都不会丢已输入的称呼 / 关系阶段（面板不在时查不到节点，空跑）。
       面板里不放确定按钮 —— 键区右下角的功能键在这个场景就是「确定」（见 enterKeyLabel）；
       另外每次变化同时调度静默保存（防抖，见 scheduleKbPartnerSave）。
       备注名还要记下光标锚点：键区打字（insert / 删除）按它插字与删字，重渲染后光标也回到这里。 */
    document.querySelectorAll('.kb-partner-editor input[id],.kb-partner-editor select[id]').forEach(node=>{
      const sync=()=>{
        if(node.id==='partner-name'){
          /* 键区打拼音时，框里显示的是「已确认文字 + 未确认的组合串」—— 那不是用户改的名字，跳过 */
          if(state.composition)return;
          state.modalData.name=node.value;state.partnerCaret=node.selectionStart;
        } else state.modalData.stage=node.value;
      };
      node.addEventListener('input',()=>{sync();scheduleKbPartnerSave();});
      node.addEventListener('change',()=>{sync();scheduleKbPartnerSave();});
      if(node.id==='partner-name')['click','keyup','select'].forEach(ev=>node.addEventListener(ev,()=>{if(!state.composition)state.partnerCaret=node.selectionStart;}));
    });
    restoreScrolls($('#app'), scrollMemo);
    /* 键盘使用引导（演示层）：主 App 整机也挂这一层（2026-09-29 起）—— 高亮框贴合目标元素
       + 打字机（不在引导里时空跑）；放 restoreScrolls 之后，滚动对位不被恢复逻辑盖掉 */
    paintKbUsageGuide();
    /* 「AI 咨询师」页输入框多行长高 / 缩略图行与快捷栏：点输入框调出的键盘要按它们一起长
       （键区高度不变，见 paintFreeInputGrowth；常驻输入栏形态下 extra 也一并记好） */
    paintFreeInputGrowth();
    /* 主 App「AI 咨询师」页的底部弹窗：高度按「2 行图片」实测（见 paintAaiSheet） */
    paintAaiSheet();
  }
  /* 全局防回弹：render/renderApp 用 innerHTML 重建整棵 DOM，聊天区、键盘区、请求列表、
     弹层等所有滚动容器的位置都会归零 —— 按一个键页面就「弹一下」。渲染前记下所有已滚动
     容器的位置，渲染后原位恢复；恢复必须瞬时（覆盖 scrollBehavior），否则从顶部平滑滚回
     原位本身就是一次回弹（.wx-chat 的 scroll-behavior:smooth 曾正是这个毛病的来源）。
     scrollKey 的定位链含 class，而面板根节点的一次性动效 class（entering/fresh）渲染一次就摘，
     会让渲染前后的 key 对不上、恢复落空 —— 所以面板里的滚动容器（#ca-body / #picker-body）
     都带稳定 id，scrollKey 一遇到 id 就收链，不再受祖先 class 抖动影响。 */
  function scrollKey(node) {
    const parts = [];
    for (let n = node; n && n.tagName !== 'BODY'; n = n.parentElement) {
      if (n.id) { parts.unshift(`#${CSS.escape(n.id)}`); return parts.join(' > '); }
      let sel = n.tagName.toLowerCase();
      if (n.classList.length) sel += `.${[...n.classList].slice(0, 2).map(c => CSS.escape(c)).join('.')}`;
      const parent = n.parentElement;
      if (parent) {
        const same = [...parent.children].filter(s => s.tagName === n.tagName);
        if (same.length > 1) sel += `:nth-of-type(${same.indexOf(n) + 1})`;
      }
      parts.unshift(sel);
      if (parts.length > 6) return ''; /* 定位链过长，结构易漂移，放弃恢复 */
    }
    return '';
  }
  function captureScrolls(root) {
    if (!root) return null;
    const memo = new Map();
    for (const el of root.querySelectorAll('*')) {
      if (el.clientHeight && el.scrollHeight > el.clientHeight + 1) {
        const key = scrollKey(el);
        if (key) memo.set(key, el.scrollTop);
      }
    }
    return memo;
  }
  function restoreScrolls(root, memo) {
    if (!root || !memo) return;
    for (const [key, top] of memo) {
      if (!top) continue;
      let el = null;
      try { el = root.querySelector(key); } catch (_) { el = null; }
      if (el) { el.style.scrollBehavior = 'auto'; el.scrollTop = top; el.style.scrollBehavior = ''; }
    }
  }
  function render() {
    if(state.appView==='app') return renderApp();
    const ctx = uiContext();
    state.renderedControls=false;
    const focused = document.activeElement;
    /* 编辑面板打开时焦点默认收回「备注名」（点过键区按钮也算）：键区打字的目标就是这个输入框；
       焦点本来就在面板内其它控件（关系阶段下拉）时不抢 */
    const inEditorForm = Boolean(focused?.closest && focused.closest('.kb-partner-editor'));
    /* 问AI 页打开时焦点默认收回提问输入框（与编辑面板的「备注名」同理）：点过键区按钮也算 */
    const inFreeChat = Boolean(focused?.closest && focused.closest('.kb-free-chat'));
    const focusId = state.kbEditor && !inEditorForm ? 'partner-name' : state.freeChat && !inFreeChat ? 'free-chat' : focused?.id;
    let selection;
    try { selection = [focused.selectionStart,focused.selectionEnd]; } catch (_) {}
    const scrollMemo = captureScrolls($('#app'));
    /* 收起态：整块键盘不渲染 —— 手机里只剩状态栏 + 会话头部 + 消息区（.wx-chat 的 flex:1 吃满
       剩余高度）+ 输入栏（贴到屏幕底边）。键盘侧的覆盖层 / 打字态已由 kbReset() 清掉，
       所以这里不用再判任何面板开关。
       「开启键盘」关闭（!permissions.kbEnabled）：键盘区域整块换成同高占位 —— LoveCo 键盘
       未加入系统键盘列表时宿主 App 只会弹系统键盘（不模拟），键盘侧覆盖层一并压住不出现。
       完全访问引导层（kb-full-access）与键盘内登录层（kb-login）也挂在这块键盘里（渲染在最后、
       层级最高）：两者互斥（先权限、后登录，见 checkKbEntry），各自盖住整块键盘、关闭后回到键盘；
       登录层协议名点开的协议正文页（kb-legal）再压在登录层之上，X / Esc 关掉即回登录层。
       **这两层都算「盖在常规键盘上」**（不拉高键盘，键盘保持 250px 那一档）：引导层用顶条 + 标题
       + 卡片 + 按钮在键盘区域内排下来，登录层则沿用键盘高度。 */
    /* 问AI 页展开图片选择器时（state.freePicker），输入行**下方**的整块键区（键体 + 平台底栏）
       换成截图网格：网格从底部往上滑出、盖住键区、超出可滚动（kb-photo-picker 的内嵌形态，
       见 theme.css 的 .free-picker）—— 面板铺满的「选择聊天截图」整页在这里不出现。 */
    const freePickerOpen = state.freeChat && state.freePicker;
    const keyboardBody = freePickerOpen
      ? LoveCoUI.render('kb-photo-picker', ctx)
      : `<div class="kb-body" id="kbbody">${LoveCoUI.render('kb-keys', ctx)}</div>${LoveCoUI.render('kb-navbar', ctx)}`;
    const keyboardSection = state.kbCollapsed ? '' : !state.permissions.kbEnabled ? `<section class="keyboard kb-off" aria-label="LoveCo 键盘未开启"><span class="kb-off-note">键盘未开启 · 宿主 App 使用系统键盘</span></section>` : `<section class="keyboard ${state.freeChat?'free-chat':''} ${state.photoPanel||state.chatPanel||state.scanPanel||state.kbEditor?'with-picker':''}" aria-label="LoveCo 模拟键盘">
              ${keyboardTopBar(ctx)}
              ${keyboardBody}
              ${state.partnerPanel?LoveCoUI.render('partner-manager', ctx):''}
              ${state.settingsPanel?LoveCoUI.render('kb-settings', ctx):''}
              ${state.photoPanel?LoveCoUI.render('kb-photo-picker', ctx):''}
              ${state.scanPanel?LoveCoUI.render('kb-scan', ctx):''}
              ${state.chatPanel?LoveCoUI.render('kb-chat-analysis', ctx):''}
              ${state.kbEditor?LoveCoUI.render('kb-partner-editor', ctx):''}
              ${state.kbFullAccess?LoveCoUI.render('kb-full-access', ctx):''}
              ${state.kbLogin?LoveCoUI.render('kb-login', ctx):''}
              ${state.kbPaywall?LoveCoUI.render('kb-paywall', ctx):''}
              ${state.kbLegal?LoveCoUI.render('kb-legal', ctx):''}
            </section>`;
    $('#app').innerHTML = `<div class="shell">
      <header class="topbar"><div class="brand"><img src="assets/brand/LoveCo_108_108.png" alt="LoveCo"><span class="brand-name">LoveCo</span><span class="brand-tag">键盘交互实验室</span></div></header>
      <main class="workspace">
        <aside class="rail left-rail"><div class="rail-section"><div class="rail-heading"><h2>平台与app形态</h2></div>${deviceSwitchers()}</div>
        ${permissionSection()}
        <div class="rail-section"><div class="rail-heading"><h2>模拟</h2></div>${simControls()}${simShotButton()}</div></aside>
        <section class="device-column"><div class="device-top"><span>${icon('Cellphone')}${platformName()} · 键盘模式 · 宿主 App 内</span><span><i class="dot"></i>${state.loggedIn?'已登录':'未登录'}</span></div>
          <div class="phone host-wechat ${state.dark?'dark':''}" id="phone" data-platform="${state.platform}">
            ${LoveCoUI.render('status-bar', ctx)}
            ${LoveCoUI.render('host-app', ctx)}
            ${keyboardSection}
            ${state.kbGuideDemo?LoveCoUI.render('kb-usage-guide', ctx):''}
            ${state.shotFlash?'<div class="shot-flash" aria-hidden="true"></div>':''}
            ${voiceHoldOverlay()}
            ${state.modal?renderModal():''}
            ${state.iosPaySheet?LoveCoUI.render('ios-pay-sheet', ctx):''}
          </div>
          <div class="device-caption">LoveCo<span></span>com.gasairea.loveco<span></span>KEYBOARD · HOST APP</div>
          ${pageDetail()}
          <div class="mobile-testbar"><div class="testbar-switchers">${surfaceButtons()}${platformButtons()}</div><button class="icon-btn" title="仿真设置" aria-label="仿真设置" data-action="simulator">${icon('Monitor')}</button></div>
        </section>
        <aside class="rail right-rail">${pageListSection()}</aside>
      </main><input type="file" id="avatar-input" accept="image/jpeg,image/png,image/webp" hidden>
    </div>`;
    bind();
    document.querySelectorAll('.sheet input[id],.sheet textarea[id],.sheet select[id]').forEach(node=>{
      const cacheKey=state.modal+':'+(state.modalData.id||'')+':'+node.id;
      if(node.type==='checkbox'||node.id.startsWith('sim-'))return;
      if(Object.hasOwn(state.formCache,cacheKey))node.value=state.formCache[cacheKey];
      node.addEventListener('input',()=>{state.formCache[cacheKey]=node.value;});
      node.addEventListener('change',()=>{state.formCache[cacheKey]=node.value;});
    });
    /* 键盘对象编辑面板（kb-partner-editor）的输入实时回存 modalData：进出头像选择器、
       保存失败的提示重渲染，都不会丢已输入的称呼 / 关系阶段（面板不在时查不到节点，空跑）。
       面板里不放确定按钮 —— 键区右下角的功能键在这个场景就是「确定」（见 enterKeyLabel）；
       另外每次变化同时调度静默保存（防抖，见 scheduleKbPartnerSave）。
       备注名还要记下光标锚点：键区打字（insert / 删除）按它插字与删字，重渲染后光标也回到这里。 */
    document.querySelectorAll('.kb-partner-editor input[id],.kb-partner-editor select[id]').forEach(node=>{
      const sync=()=>{
        if(node.id==='partner-name'){
          /* 键区打拼音时，框里显示的是「已确认文字 + 未确认的组合串」—— 那不是用户改的名字，跳过 */
          if(state.composition)return;
          state.modalData.name=node.value;state.partnerCaret=node.selectionStart;
        } else state.modalData.stage=node.value;
      };
      node.addEventListener('input',()=>{sync();scheduleKbPartnerSave();});
      node.addEventListener('change',()=>{sync();scheduleKbPartnerSave();});
      if(node.id==='partner-name')['click','keyup','select'].forEach(ev=>node.addEventListener(ev,()=>{if(!state.composition)state.partnerCaret=node.selectionStart;}));
    });
    /* 登录层（kb-login）的输入绑定挪到 bind() 里（见 bindKbLoginInputs）—— 主 App 形态
       与键盘形态都会渲染这一层，绑定只写一处，两处共用。 */
    if (focusId && document.getElementById(focusId)) {
      const node = document.getElementById(focusId);
      restoringFocus = true;
      node.focus({preventScroll:true});
      restoringFocus = false;
      if (typeof node.setSelectionRange === 'function') {
        /* host 与编辑面板「备注名」的显示值里都含未确认的组合串，光标位置按状态算
           （锚点 + 组合串长度）：重渲染前那一刻的选区可能已经过期
           （组合串刚被候选词替换，长度变了）。 */
        if (node.id === 'host' || node.id === 'partner-name' || node.id === 'free-chat') {
          const offset = (state.composition || '').length;
          const anchor = node.id === 'host' ? state.hostCaret : targetCaret();
          const pos = Math.min(anchor + offset, node.value.length);
          try { node.setSelectionRange(pos, pos); } catch (_) {}
        } else if (selection) { try {node.setSelectionRange(...selection);} catch(_){} }
      }
    }
    restoreScrolls($('#app'), scrollMemo);
    /* 聊天区此前不滚动（内容不足一屏）而这次变长了：直接贴底看最新消息 */
    if ($('#chat') && !scrollMemo?.has('#chat')) $('#chat').scrollTop = $('#chat').scrollHeight;
    /* 打字机输出时把内容区滚到底：新吐出的字始终在视野里（内容长到需要滚动时尤其明显） */
    if (state.stream) { const body=$('.ca-body'); if(body)body.scrollTop=body.scrollHeight; }
    paintComposeMirror();
    /* 问AI 页的输入框多行长高 / 缩略图行与快捷栏：整块键盘要按它们一起往上长（键区高度不变） */
    paintFreeInputGrowth();
    /* 键盘使用引导（演示层）：高亮框贴合目标元素 + 打字机（不在引导里时空跑） */
    paintKbUsageGuide();
  }
  /* 「模拟」组（两种 App形态的左栏都渲染；**键盘形态**窄屏是「仿真控制台」弹层 —— 主 App 形态的
     右栏「APP STATE」与「仿真控制台」入口 2026-09-29 已按需求删除，那一形态只剩左栏这一处）的仿真开关：
     2026-10-06 需求重排后的顺序：**首启引导第一**，其后 登录状态 /（仅主 App）已设置性别 /
     （仅键盘形态）模拟试用额度耗尽 / 会员状态 / 模拟安全拦截 /（仅主 App）模拟好友使用AI
     —— 「模拟试用额度耗尽」与组底的「模拟截屏」（simShotButton）**只在键盘形态渲染**
     （2026-10-06 需求）：这两条仿真服务的是键盘那条链路（额度不足弹键盘内付费引导层、
     截屏进 AI 分析 / 待分析缩略图），主 App 形态左栏不再显示它们。
     「会员状态」（2026-10-05 以「永久会员」开关补下，**2026-10-06 改成四档下拉**、两形态共用）
     控制**当前这台设备的会员状态**，四档：**未开通 / 非订阅会员 / 订阅会员 / 永久会员**——
     未开通 = member=false / memberExpiry=null；非订阅会员 = 已开通但**没有到期日**
     （member=true / memberExpiry=null，老存档与手动置档都是这一档）；
     订阅会员 = **有到期日**的一档（member=true / memberExpiry=未来时刻；购买周·季度档、
     邀请奖励、兑换码都落这一档，仿真取「今天 +30 天」——「我的」页会员横幅随之打出
     「YYYY-MM-DD到期」）；永久会员 = member=true / memberExpiry=0（与购买永久档同一态，
     横幅标题变「LoveCo 永久会员」、不收升级胶囊、不显示到期日行）。
     下拉选中档由会员态本身反推（memberTier()），四档都是**直接设置**、不做快照（与「登录状态」
     同一套做法）—— 真买过永久档 / 老存档是会员时它自动落在对应那一档。
     原「永久会员」开关（2026-10-05 ~ 2026-10-06）已由它取代，勿再补回。
     「已设置性别」（2026-09-28 补「首次登录App」、2026-10-06 改名且语义反过来）表示**性别有没有
     设置好**，也就是**性别 / 出生日期这两页要不要弹**：关（新设备就是这样）= 登录成功后走资料引导
     （选择性别 → 出生日期，见 startOnboarding），**性别那一步不可跳过**，走完自动置成开；
     开 = 已设置、登录直接回原处。想再看一遍就手动关掉它。**首启引导期间无条件走这两页**
     （刚装上的 App 第一次登录必然要设性别 / 生日），因此**首启正常走完时它一定是开的** ——
     只有在性别页上主动退出 App、首启没走完时它才留在关着，于是下次登录照着它再检查一次性别。
     **它只在主 App 形态渲染**（2026-09-29 需求：「仅在主 App 时显现」）—— 资料引导是主 App 的
     流程（键盘形态登录也会切到主 App 走完，见 startOnboarding），键盘形态左栏与「仿真控制台」
     弹层都不再显示这一行；开关状态本身仍落库、不随形态丢，想切它就切到主 App。
     「首启引导」（2026-10-06 补，默认关，**两种 App形态都渲染** —— 与「已设置性别」不同，
     它模拟的是一次「打开 App」、不专属主 App；**2026-10-06 晚些需求：排在这一组的第一位**，
     原先它在「登录状态」下面）一键把设备摆回「刚装上 App、第一次打开」：
     除「蜂窝网络」外的设备权限与仿真开关全部复位（「已设置性别」一并回「关」、相册访问权限回「关闭」），
     主 App 随即整页落「开启键盘」引导页（见 firstLaunchReset）；走完引导自动复位成关。
     原「请求结果」下拉已删除（见 state.outcome 注释），每条都是同一格式的 control-line + 开关 / 下拉。
     多处同时渲染时靠前缀区分控件 id（见 state.renderedControls）。
     原「语音指令」下拉**已整行删除**（2026-10-06 需求：「语音指令 现在只有评价一句，因此隐藏
     （app、键盘都隐藏）」）—— 它只有「评价一句」一档，选什么都不改变行为；VOICE_QUERIES /
     state.voiceQuery 与按住说话那条链路照旧按这一档走（见 VOICE_QUERIES），只是不再有 UI 入口。 */
  /* 「模拟 › 会员状态」四档（2026-10-06 需求，把 2026-10-05 那颗「永久会员」开关改成下拉）：
     未开通 / 非订阅会员 / 订阅会员 / 永久会员。**四档都只存 member + memberExpiry**
     （memberTier / setMemberTier），下拉本身不落库 —— 选中档由会员态反推，
     刷新后仍落在同一档。订阅会员取「今天 +30 天」，够看「我的」页横幅上的到期日行。 */
  const MEMBER_TIERS = [
    {id:'none',name:'未开通',member:false,days:null},
    {id:'non-sub',name:'非订阅会员',member:true,days:null},
    {id:'sub',name:'订阅会员',member:true,days:30},
    {id:'permanent',name:'永久会员',member:true,days:0},
  ];
  /* 当前会员态落在哪一档：没有会员标识 = 未开通；memberExpiry === 0 = 永久；
     已开通但没有到期日（null，老存档 / 手动置档）= 非订阅会员；有过期日 = 订阅会员 */
  function memberTier() {
    if(!state.member)return 'none';
    if(state.memberExpiry===0)return 'permanent';
    if(state.memberExpiry===null)return 'non-sub';
    return 'sub';
  }
  function setMemberTier(id) {
    const t=MEMBER_TIERS.find(x=>x.id===id)||MEMBER_TIERS[0];
    state.member=t.member;
    state.memberExpiry=!t.member?null:(t.days===null?null:(t.days?Date.now()+t.days*86400000:0));
    /* 会员一到位，「模拟试用额度耗尽」那条就没意义了（付费引导只对非会员触发）——
       与购买 / 兑换到账时复位那颗开关同一套口径 */
    if(t.member){state.creditsOut=false;state.creditsSnapshot=null;}
  }
  function simControls() {
    const prefix=state.renderedControls?'sim-dialog-':'sim-';state.renderedControls=true;
    /* 「已设置性别」仅主 App 形态显示（2026-09-29 需求）：键盘形态下不渲染这一行 ——
       下面的前缀正则保留 mock-gender-set 不受影响（匹配不到就不替换） */
    const genderSetRow=state.appView==='app'
      ? `
  <div class="control-line"><label for="mock-gender-set" title="性别有没有设置：关（新设备就是这样）= 登录成功后先走资料引导（选择性别 → 出生日期，性别那一步不可跳过），走完自动置成开；开 = 已设置，登录直接回原处。首启引导期间无条件走资料引导">已设置性别</label><input id="mock-gender-set" class="switch" type="checkbox" ${state.genderSet?'checked':''}></div>`
      : '';
    /* 「模拟试用额度耗尽」**仅键盘形态显示**（2026-10-06 需求）：额度不足弹付费引导层是键盘那条链路上的
       行为（主 App 额度不足走的是会员购买页），所以主 App 形态的左栏不再有这一行。
       键盘形态下同时出现在左栏与「仿真控制台」弹层，两处同一个 state.creditsOut。 */
    const creditsRow=state.appView==='keyboard'
      ? `
  <div class="control-line"><label for="mock-credits" title="打开 = 把试用额度清零并去掉会员身份（原值存快照、关掉原样还原），键盘形态发起生成时即被拦下、弹出键盘内会员开通覆盖层">模拟试用额度耗尽</label><input id="mock-credits" class="switch" type="checkbox" ${state.creditsOut?'checked':''}></div>`
      : '';
    /* 「模拟好友使用AI」按钮（2026-10-05 新增，与「模拟截屏」同一类「按一下发生一件事」的按钮）：
       邀请有礼页「奖励待激活 → 已到账」的推进开关 —— 按一下把一位待激活好友置为「已使用 AI」、
       邀请奖励 +3 天到账（没有待激活好友时新加一条已到账记录；达标的阶梯奖励一并补发），
       见 simInviteUse。**只在主 App 形态渲染**（邀请页是主 App 的页面，键盘形态渲染不到它，
       与上面「已设置性别」同一套 appView 分支）；右侧小字标出还有几位好友待激活。 */
    const inviteSim=state.appView==='app'
      ? (()=>{const pending=state.inviteFriends.filter(f=>f.status==='pending').length;
          return `<button class="row-button" data-action="sim-invite-use" title="按一下：把一位「待激活」好友置为已使用 AI（邀请奖励 +3 天到账）；没有待激活好友时新加一条已到账记录，并自动补发达标了的阶梯奖励">${icon('User')}模拟好友使用AI${pending?`<span class="end">待激活 ${pending} 位</span>`:''}</button>`;})()
      : '';
    /* 「首启引导」开关（2026-10-06 需求，**两种 App形态都渲染** —— 它模拟的是一次「打开 App」，
       不是主 App 专属的流程）：打开即把设备摆回新机并让主 App 落「开启键盘」引导页，
       见 firstLaunchReset；checked 由 state.firstLaunch 推导，走完整个首启链路落首页时
       自动复位成关（见 clearFirstLaunch）。**2026-10-06 晚些需求：这一行排在本组第一位**。 */
    const firstLaunchSwitch=`<div class="control-line"><label for="mock-first-launch" title="打开 = 把设备摆回「刚装上 App、第一次打开」：除「蜂窝网络」外的设备权限与仿真开关全部复位（「已设置性别」一并回「关」、相册访问权限回「关闭」），主 App 随即整页落「开启键盘」引导页">首启引导</label><input id="mock-first-launch" class="switch" type="checkbox" ${state.firstLaunch?'checked':''}></div>`;
    /* 「会员状态」四档下拉（2026-10-06 由「永久会员」开关改来，两形态共用）：
       整台设备的会员身份一次摆好，选中档由 memberTier() 从会员态反推 */
    const memberRow=`
  <div class="control-line"><label for="mock-member" title="这台设备的会员身份：未开通 / 非订阅会员（已开通但没有到期日）/ 订阅会员（有到期日，仿真取今天 +30 天，「我的」页横幅显示到期日行）/ 永久会员（与购买永久档同一态，横幅标题「LoveCo 永久会员」、不显示到期日行）">会员状态</label><select id="mock-member">${MEMBER_TIERS.map(t=>`<option value="${t.id}"${memberTier()===t.id?' selected':''}>${t.name}</option>`).join('')}</select></div>`;
    const markup=`${firstLaunchSwitch}
  <div class="control-line"><label for="mock-login">登录状态</label><input id="mock-login" class="switch" type="checkbox" ${state.loggedIn?'checked':''}></div>${genderSetRow}${creditsRow}${memberRow}
   <div class="control-line"><label for="mock-block">模拟安全拦截</label><input id="mock-block" class="switch" type="checkbox" ${state.outcome==='blocked'?'checked':''}></div>${inviteSim}`;
    return markup.replace(/(id|for)="(mock-login|mock-gender-set|mock-first-launch|mock-credits|mock-member|mock-block)"/g,(_,attribute,id)=>`${attribute}="${prefix+id}"${attribute==='id'?` data-control="${id}"`:''}`);
  }
  /* 「模拟」组底部的「模拟截屏」（**只在键盘形态渲染** —— 2026-10-06 需求，与「模拟试用额度耗尽」
     同一套取舍：截屏分析是键盘链路上的动作；键盘形态里左栏与「仿真控制台」弹层的同名按钮都走
     sim-screenshot，后者另有「收到新消息」那颗按钮，见 renderModal）：
     它不是开关，而是「按一下发生一件事」的按钮 —— 一次系统截屏键的仿真，
     后果按键盘此刻是否激活分两条路（见 takeScreenshot）。
     右侧小字是待分析提示位的状态：有截图挂着（等键盘唤起 / 等三关通过）时标出来，
     免得只看手机不知道还有一张截图在等着分析。 */
  function simShotButton() {
    if(state.appView!=='keyboard')return '';
    const end=state.pendingShot?'<span class="end">待分析 1 张</span>':'';
    return `<button class="row-button" data-action="sim-screenshot">${icon('Picture')}模拟截屏${end}</button>`;
  }
  /* —— 键盘使用引导（kb-usage-guide 组件）：整机覆盖的纯演示层（假页面）——
     入口是**主 App 页面列表**的对应条目（右栏点入）；**也是引导链路的最后一站**（2026-10-08
     需求：第二步切完键盘 → 登录 → 资料引导之后的收尾演示，见 guideAfterSwitch / guideToDemo）。
     它不接真实链路：截图不进
     相册、分析不发请求、发送也不走宿主输入框 —— 每一步只改 state.kbGuideDemo 再渲染，
     步骤之间的过渡（白闪 / 键盘弹起 / 分析动画 / 选回复）由 gxTimer 接力；
     高亮框与提示的位置、以及打字机的逐帧推进，都在每次 render 之后由
     paintKbUsageGuide() / gxTyping() 直接改 DOM（见下方两个函数）。 */
  function openKbUsageGuide(fromGuide = false) {
    /* 这一层是自绘的整机覆盖层（聊天页与键盘都自己画，不读底层页面），主 App 与键盘
       两种形态的整机都挂它（render / renderApp）—— 点入**不切 App形态**，就地开演。
       fromGuide：这一次是引导链路（切换键盘 → 登录 → 资料引导）走完开演的 ——
       收场时不去别处、直接完成引导（见 closeKbUsageGuide / closeKbUsageGuideSilent） */
    abortVoiceHold();
    state.gxFromGuide = !!fromGuide;
    state.kbGuideDemo = 'shot';
    state.gxTyped = 0;
    clearTimeout(state.gxTimer); state.gxTimer = null;
    clearTimeout(state.gxStreamTimer); state.gxStreamTimer = null;
    /* 键盘底座按「刚被唤起的干净键盘」摆：中文、字母层、无组合串、不在打字态
       （语言 / 层不落库，布局沿用设置里选的那套） */
    state.typing = false; state.composition = ''; state.t9Path = 0; state.layer = 'letters'; state.language = 'zh'; state.shift = false;
    render();
  }
  /* 演示层的一个出口：Esc 与「去使用」（gxAdvance 的 win 步，那一步另跳首页、不经过这里）。
     从引导链路（切换键盘 → 登录 → 资料引导 → 最后开演这一站）进来的那一次，
     **收场 = 引导完成**（落首页 + 补跑状态检查链后两环 + 等 1 秒弹会员购买页，见 finishGuide）——
     不再回到之前那一页；
     其余时候照旧只收层、渲染当前页面。 */
  function closeKbUsageGuide() {
    const fromGuide = state.gxFromGuide;
    closeKbUsageGuideSilent();
    if(fromGuide) return finishGuide();
    return render();
  }
  /* 只清状态不渲染 —— 供页面导航（setupPage）在改页面状态前调用，避免先渲染一帧旧页面；
     gxFromGuide 一并清掉（这一次演示到此为止，别让后续某次收场误判成「从引导链路进来的」）；
     演示待演标记（guideDemoPending）也清掉 —— 演示层一收，这一轮引导链路就到头了 */
  function closeKbUsageGuideSilent() {
    clearTimeout(state.gxTimer); state.gxTimer = null;
    clearTimeout(state.gxStreamTimer); state.gxStreamTimer = null;
    state.kbGuideDemo = ''; state.gxTyped = 0; state.gxFromGuide = false;
    state.guideDemoPending = false;
  }
  /* 引导的推进：每一步点高亮区域触发一次，按当前步做一件事再切下一步。
     arg 必须等于当前步 —— 防双击 / 旧 DOM 的点击把引导推进错步。 */
  function gxAdvance(arg) {
    if (state.kbGuideDemo !== arg) return;
    if (arg === 'shot') {
      /* 模拟截屏：遮罩随重渲染瞬间消失 + 整屏白闪一下 + 左下角先弹出大截图卡再缩成
         「刚截的截图」缩略图（停约半拍后自己滑走，动画写在 .gx-shot-pop 上）——
         900ms 与那一段动画同步后改成高亮宿主输入框 */
      state.kbGuideDemo = 'flash';
      render();
      state.gxTimer = setTimeout(() => { state.gxTimer = null; if (state.kbGuideDemo === 'flash') { state.kbGuideDemo = 'composer'; render(); } }, 900);
      return;
    }
    if (arg === 'composer') {
      /* 唤出键盘：聊天区随键盘弹起收窄（高度动画在 .gx-kb 上），弹完再出现缩略图提示 */
      state.kbGuideDemo = 'kb';
      render();
      state.gxTimer = setTimeout(() => { state.gxTimer = null; if (state.kbGuideDemo === 'kb') { state.kbGuideDemo = 'thumb'; render(); } }, 560);
      return;
    }
    if (arg === 'thumb') {
      /* 分析：先播一段「正在分析中…」过场（kb-scan 皮肤，键盘拉高到三分之二屏），再进打字机
         —— 2026-09-29 两次提速（每次快 1/3）：1 秒 → 750ms → 560ms */
      state.kbGuideDemo = 'scan';
      render();
      state.gxTimer = setTimeout(() => { state.gxTimer = null; if (state.kbGuideDemo === 'scan') { state.kbGuideDemo = 'stream'; state.gxTyped = 0; render(); } }, 560);
      return;
    }
    if (arg === 'pick') {
      /* 选回复：整卡先亮一下（.picked），半拍后面板**留在屏上**（不再收起回键盘）——
         高亮移到面板底部那颗「发送」，点它才发 */
      $('.kb-usage-guide [data-gx="idea1"]')?.classList.add('picked');
      state.gxTimer = setTimeout(() => { state.gxTimer = null; if (state.kbGuideDemo === 'pick') { state.kbGuideDemo = 'send'; render(); } }, 420);
      return;
    }
    if (arg === 'send') { state.kbGuideDemo = 'win'; return render(); }
    if (arg === 'win') {
      /* 「去使用」：收掉演示层 —— 从引导链路（切换键盘 → 登录 → 资料引导之后的最后这一站）
         进来的那一次同 Esc：直接完成引导（落首页 + 排自动付费墙，见 closeKbUsageGuide）；
         其余（页面列表点入的演示）跳主 App 首页 */
      const fromGuide = state.gxFromGuide;
      closeKbUsageGuideSilent();
      if (fromGuide) return finishGuide();
      return openAppScreen('home');
    }
  }
  /* 引导层渲染后的对位（每次 render 之后调用）：高亮框贴合当前步的目标元素、提示块贴在
     目标的上下方、聊天区滚到底，随后交给打字机（stream 步）。
     坐标不写死在 CSS 里 —— 目标（消息行 / 输入框 / 缩略图 / 回复卡 / 发送键）的位置随
     屏幕高度与键盘状态变化，实测后再写才能贴合；写进 .gx-spot 的内联样式（cssText 全量
     覆盖，重渲染后不会残留上一步的坐标）。 */
  function paintKbUsageGuide() {
    const layer = $('.kb-usage-guide');
    if (!layer) return;
    /* 聊天区先滚到底（最新消息在视野内）—— 必须在下面测高亮框之前：滚动会挪动消息位置，
       测完再滚会把高亮框留在旧位置上 */
    const chat = layer.querySelector('.gx-chat');
    if (chat) chat.scrollTop = chat.scrollHeight;
    /* 分析面板那几步：整块键盘拉高到手机屏幕的三分之二（与真机 .keyboard.with-picker 同一
       比例）—— 用 px 写进 --gx-kb-panel-h，面板收起（send）时的高度动画才有可插值的起点 */
    const body = layer.querySelector('.gx-body');
    if (body) layer.style.setProperty('--gx-kb-panel-h', `${Math.round(body.clientHeight * 0.66667)}px`);
    const place = () => {
      if ($('.kb-usage-guide') !== layer) return;   /* 已重渲染，这层 DOM 过期了 */
      const spot = layer.querySelector('.gx-spot');
      const tip = layer.querySelector('.gx-tip');
      const target = spot?.dataset.target ? layer.querySelector(spot.dataset.target) : null;
      if (!spot || !target) return;
      const pad = Number(spot.dataset.pad || 6);
      const a = layer.getBoundingClientRect();
      const b = target.getBoundingClientRect();
      const fit = (r) => {
        spot.style.cssText = `left:${Math.round(r.left - a.left - pad)}px;top:${Math.round(r.top - a.top - pad)}px;width:${Math.round(r.width + pad * 2)}px;height:${Math.round(r.height + pad * 2)}px`;
      };
      fit(b);
      if (tip) {
        /* 提示三种摆法：① 默认 —— 落在目标的上方或下方（手指朝目标换向 👆 / 👇）；
           ② left —— 贴在目标的**左侧**、垂直居中，手指在文字右端朝右指着目标
           （菜单栏那颗缩略图右边只剩几十像素，提示只能往左摆）；
           ③ face —— 上下摆法与默认一样，水平改按**手指**对位（发送那一步，2026-09-29 需求：
           整块提示左移，让朝下的手势正好落在发送按钮的中轴线上）；
           还有 mode=self（第一步）—— 走默认摆法定水平，竖直最后改到开场说明卡下方（见下）；
           第一步没有手势 emoji（face 不存在，下面的换向直接跳过） */
        const mode = spot.dataset.mode || '';
        const face = tip.querySelector('.gx-tip-face');
        if (mode === 'left') {
          const w = tip.offsetWidth;
          tip.style.left = `${Math.round(Math.min(Math.max(b.left - a.left - 10, w + 6), a.width - 6))}px`;
          tip.style.top = `${Math.round(b.top - a.top + b.height / 2)}px`;
        } else {
          /* 目标偏上 → 提示放下方（手指朝上指）；目标偏下 → 提示放上方（手指朝下指）；
             水平跟着目标中心走，再按提示的实际宽度夹进手机内（两侧各留 6px），免得文字出屏。
             face 模式把锚点从「块中心」换成「手势中心」：提示块是「文字在左、手势在右」的
             横排且整块 translateX(-50%)（left 即块中心），所以块左移「文字 + 间隙」的一半
             （= 块宽 - 手势宽 的一半）后，手势中心就与目标中心重合 */
          const below = b.bottom + 74 < a.bottom;
          tip.classList.toggle('gx-tip-up', !below);
          if (face) face.textContent = below ? '👆' : '👇';
          const half = tip.offsetWidth / 2 + 6;
          let center = b.left - a.left + b.width / 2;
          if (mode === 'face' && face) center -= (tip.offsetWidth - face.offsetWidth) / 2;
          tip.style.left = `${Math.round(Math.min(Math.max(center, half), a.width - half))}px`;
          tip.style.top = `${Math.round(below ? b.bottom - a.top + 14 : b.top - a.top - 14)}px`;
        }
        /* self = 提示块本身就是高亮目标（第一步的「模拟截屏」按钮）：水平仍按锚点
           （消息行）居中，竖直改落到**开场说明卡的正下方**（间隔 20px —— 2026-10-08 需求：
           说明卡居中在屏幕正中，按钮跟到卡片下面，读起来是「说明 + 按钮」一叠）。
           卡片在 CSS 里是 top:50% + translateY(-50%) 居中（见 styles.css 的 .gx-intro）：
           offsetTop 量到的是位移之前的盒子顶（正好落在屏幕中线上），所以**视觉底边 =
           offsetTop + 半个身高**。用 offset* 而不是 getBoundingClientRect() —— 卡片带居中
           位移与半拍入场的位移动画两段 transform，rect 会把它们都算进去、量出来偏下。
           随后高亮框改贴提示块自身 —— 位置由上面算出、不依赖锚点，重复对位结果恒定，
           不会出现「框随框走」的漂移。框在水平方向比静止盒子再各让出一点：按钮带
           「放大缩小」跳动（scale 1 → 1.12，见 theme.css 的 gx-tip-pulse），宽比高
           大得多、同一系数下水平张开得更多，按静止盒子贴框，跳到峰值时左右就贴住
           框缘、与上下不匀（2026-10-08 需求：跳到最大时四边间隙一致）。补偿量 =
           峰值视觉宽高差 - 静止宽高差：-2deg 旋转 + 1.12 倍缩放的轴对齐盒，宽高差
           相对静止约放大了 8%（旋转的 cos / sin 两向相抵后 ≈ 1.08），即
           0.08 × (宽 - 高)，左右各分一半；框的宽高都拿 .gx-tip 的布局盒算
           （translateX(-50%) 不改尺寸、内部文字块的缩放也不进父盒 rect）。
           这一步不走 fit 的整数取整：跳跃峰值时框与按钮只剩一两像素的间隙，
           哪个边界取整偏半像素、四边看着就不匀了 —— 保留 0.1px 精度，框中心
           与提示块中心严格重合，四边间隙按峰值精确一致 */
           if (mode === 'self') {
           const card = layer.querySelector('.gx-intro');
           if (card) tip.style.top = `${card.offsetTop + card.offsetHeight / 2 + 20}px`;
           const r = tip.getBoundingClientRect();
           const grow = (r.width - r.height) * 0.08;
           const px = (v) => `${v.toFixed(1)}px`;
           spot.style.cssText = `left:${px(r.left - a.left - pad - grow / 2)};top:${px(r.top - a.top - pad)};width:${px(r.width + pad * 2 + grow)};height:${px(r.height + pad * 2)}`;
           }
      }
    };
    place();
    /* 马上对一次之后再在动画收尾时补对一次：面板滑入 / 键盘回落这些动画带着目标一起走
       （transform 与高度都会改 rect），只对一次会停在动画中途的位置上 */
    setTimeout(place, 400);
    gxTyping();
  }
  /* 引导的打字机：按 GUIDE_DEMO.order 逐字输出（每帧 2 字、22ms 一帧，全篇约 1 秒 ——
     2026-09-29 两次提速（每次快 1/3）：帧间隔 40ms → 30ms → 22ms），
     帧内直接改 textContent（不整页重渲染 —— 否则键盘弹起、面板滑入这类动画会被每帧重播）；
     state.gxTyped 是已输出字数，重渲染后组件按它截断重绘、这里从原地继续输出。
     全部输出完后隔半拍（gxStreamTimer 防重入）自动切到「选回复」步。 */
  function gxTyping() {
    if (state.kbGuideDemo !== 'stream') return;
    const layer = $('.kb-usage-guide');
    if (!layer) return;
    const order = GUIDE_DEMO.order;
    const full = order.map((key) => GUIDE_DEMO.text[key]);
    const total = full.reduce((sum, text) => sum + text.length, 0);
    const nodes = order.map((key) => layer.querySelector(`[data-gx-type="${key}"]`));
    if (nodes.some((node) => !node)) return;
    const paint = () => {
      let left = state.gxTyped;
      nodes.forEach((node, i) => {
        const take = Math.max(0, Math.min(full[i].length, left));
        left -= full[i].length;
        const text = full[i].slice(0, take);
        if (node.textContent !== text) node.textContent = text;
        node.classList.toggle('gx-typing', take > 0 && take < full[i].length);
      });
      const bar = layer.querySelector('.gx-sheet-body');
      if (bar) bar.scrollTop = bar.scrollHeight;
    };
    if (state.gxTyped >= total) {
      paint();
      if (!state.gxStreamTimer) {
        state.gxStreamTimer = setTimeout(() => {
          state.gxStreamTimer = null;
          if (state.kbGuideDemo === 'stream') { state.kbGuideDemo = 'pick'; render(); }
        }, 520);
      }
      return;
    }
    clearTimeout(state.gxTimer);
    const tick = () => {
      state.gxTimer = null;
      if (state.kbGuideDemo !== 'stream') return;
      state.gxTyped = Math.min(total, state.gxTyped + 2);
      paint();
      if (state.gxTyped < total) state.gxTimer = setTimeout(tick, 22);
      else gxTyping();
    };
    tick();
  }
  /* 键盘顶部：菜单栏（第一状态），打字时切到候选词栏（第二状态）；
     问AI 页（kb-free-chat）打开时整块换成「问AI」标题栏 + 输入区（缩略图行 / 快捷栏 / 提问输入行）
     （打字时其中的标题栏那行换成候选词栏，输入行始终在）。 */
  function keyboardTopBar(ctx) {
    if (state.freeChat) return LoveCoUI.render('kb-free-chat', ctx);
    return state.typing ? LoveCoUI.render('kb-candidates', ctx) : LoveCoUI.render('kb-toolbar', ctx);
  }
  /* 菜单栏下面默认就是键盘按键区（kb-keys），键区之上不再有内容区：
     生成进度由聊天分析面板 / 扫描过渡页承接，原「失败 / 拦截」错误卡已删除
     —— 安全拦截（400）有面板拦截态提示（见 generate() 的 catch），其余失败仍是静默回干净键盘页。 */
  /* —— 打字机（聊天分析面板）：把本次结果按**页面自上而下的顺序**逐段吐出 ——
     关系简报（「关系阶段 / 聊天氛围」一行 → 正文）→ AI 回复正文 → 回复思路 → 建议卡
     （逐张：先策略行再回复正文）。每段都是「有才打」（两种结果见 makeOutcome），
     所以同一套打字机同时服务截图分析（简报 + 三张卡）与语音追问（简报卡 + AI 回复 + 回复思路）。
     打字帧不整页重渲染，而是 paintStream() 直接改当前段落 / 卡片的文字、挪光标、滚到底，
     避免入场动画被每帧重置 —— 段落只在真正挂载的那次渲染里播一次入场动画。
     generation 记的是本次请求：重新生成 / 取消后再跑的 stream 与 state.generation 对不上就自行停下。 */
  function stopStream() { clearTimeout(state.streamTimer); state.streamTimer=null; state.stream=null; }
  /* 关系简报的打字素材（两行标签 + 正文），与 kb-chat-analysis.js 的渲染保持同一份文案 */
  function briefParts() {
    const b=state.chatBrief||{};
    /* 阶段缺省时取默认档位「熟悉」，与 makeBrief() 的取值保持一致 */
    return [`关系阶段：${b.stage||DEFAULT_STAGE}`,`聊天氛围：${b.vibe||'冷淡陌生'}`,b.text||''];
  }
  /* 本次要吐的段落队列：每个 step = {part, card}（card < 0 表示不属于某张建议卡）。
     part 依次可能为 grid / brief / answer / thinking / title / reply —— 与组件里的各区块一一对应 */
  function streamSteps() {
    const steps=[];
    if(state.chatBrief?.text)steps.push({part:'grid',card:-1},{part:'brief',card:-1});
    if(state.chatAnswer)steps.push({part:'answer',card:-1});
    if(state.chatThinking)steps.push({part:'thinking',card:-1});
    (state.results||[]).forEach((_,i)=>{steps.push({part:'title',card:i},{part:'reply',card:i});});
    return steps;
  }
  /* 某一段的完整文字（打字机按它算进度，与组件取的是同一份数据） */
  function stepText(step) {
    if(step.card>=0){const item=state.results[step.card];return item?(step.part==='title'?item.title:item.reply):'';}
    if(step.part==='grid'){const g=briefParts();return g[0]+g[1];}
    if(step.part==='brief')return briefParts()[2];
    if(step.part==='answer')return state.chatAnswer||'';
    if(step.part==='thinking')return state.chatThinking||'';
    return '';
  }
  /* 这一段要不要整页渲染一次（让还没挂载的区块出现）：简报区在面板打开那次渲染就挂好了，
     其余段落（AI 回复 / 回复思路 / 每张建议卡的头一段）都等轮到自己才挂载、播入场动画。 */
  function stepNeedsMount(step) {
    if(step.card>=0)return step.part==='title';
    return step.part==='answer'||step.part==='thinking';
  }
  /* 把打字机拨到第 i 段：s.part / s.card 是组件与 paintStream() 都读的两个字段 */
  function applyStep(s,i) {
    const step=s.steps[i];
    s.i=i;s.chars=0;s.part=step?step.part:'';s.card=step?step.card:-1;
  }
  /* 结果到手后先起打字机：按 streamSteps() 的顺序逐段输出 */
  function startStream() {
    stopStream();
    const steps=streamSteps();
    if(!steps.length){state.chatPhase='done';return;}
    state.chatPhase='stream';
    state.stream={steps,i:0,chars:0,part:'',card:-1,generation:state.generation};
    applyStep(state.stream,0);
    renderFresh();
    state.streamTimer=setTimeout(streamStep,380);
  }
  /* 每帧 2 个字（约 55 字/秒）；一段吐完停 300ms 再吐下一段，新卡的策略行前停 340ms */
  function streamStep() {
    const s=state.stream;
    if(!s||s.generation!==state.generation)return;
    const step=s.steps[s.i];
    if(!step)return finishStream();
    const fullLen=stepText(step).length;
    if(s.chars<fullLen){
      s.chars=Math.min(s.chars+2,fullLen);
      paintStream();
      state.streamTimer=setTimeout(streamStep,36);
      return;
    }
    const next=s.i+1;
    if(next>=s.steps.length)return finishStream();
    applyStep(s,next);
    /* 下一段需要挂载就整页渲染一次（带入场动画），否则接着局部改字 */
    if(stepNeedsMount(s.steps[next]))renderFresh();else paintStream();
    state.streamTimer=setTimeout(streamStep,s.steps[next].part==='title'?340:300);
  }
  function finishStream() { stopStream(); state.chatPhase='done'; renderFresh(); }
  /* 带一次性动效标记的渲染：面板根元素挂 .fresh，入场动画只写在 .fresh 作用域里，
     渲染完立刻摘掉 —— 之后的普通重渲染（提示条、填入等）不会重放动画。 */
  function renderFresh() { state.chatFx=true; render(); state.chatFx=false; }
  /* 打字帧的局部更新：当前段落已挂载就直接改文字、挪光标、滚到底；
     还没挂载（刚轮到下一段）才整页渲染一次，让它带着入场动画出现。 */
  function paintStream() {
    const s=state.stream;
    if(!s)return;
    let cursor=document.getElementById('ca-cursor');
    if(!cursor){cursor=document.createElement('span');cursor.id='ca-cursor';cursor.className='ca-cursor';cursor.setAttribute('aria-hidden','true');}
    /* 简报阶段：先「关系阶段 / 聊天氛围」一行，再吐正文；简报卡已随渲染挂载，直接就地改文字 */
    if(s.part==='grid'||s.part==='brief'){
      const g=briefParts();
      const inGrid=s.part==='grid';
      const gridP=document.querySelector('.kb-chat-analysis .ca-brief-grid');
      if(gridP){
        const sp1=gridP.children[0],sp2=gridP.children[1];
        if(sp1){sp1.textContent=g[0].slice(0,inGrid?Math.min(s.chars,g[0].length):g[0].length);sp1.hidden=!sp1.textContent;if(inGrid&&s.chars<=g[0].length)sp1.appendChild(cursor);}
        if(sp2){sp2.textContent=inGrid?(s.chars>g[0].length?g[1].slice(0,s.chars-g[0].length):''):g[1];sp2.hidden=!sp2.textContent;if(inGrid&&s.chars>g[0].length)sp2.appendChild(cursor);}
      }
      const textRow=document.querySelector('.kb-chat-analysis .ca-brief-text');
      if(textRow){
        textRow.hidden=inGrid;
        if(!inGrid){const p=textRow.querySelector('p');if(p){p.textContent=g[2].slice(0,s.chars);p.appendChild(cursor);}}
      }
    } else if(s.part==='answer'||s.part==='thinking'){
      /* AI 回复正文 / 回复思路：这两个区块要等轮到自己才挂载（见 stepNeedsMount），就地改文字。
         评价形态里它们在关系简报卡内按 markdown 排版（容器带 .ca-md）：每帧把已吐出的部分
         重算成 HTML（标题 / 列表 / 段落），光标挂在最后一个块的末尾；
         纯问答形态仍是纯文本 pre-wrap，每个字只改文本节点，更省 */
      const box=document.querySelector(s.part==='answer'?'.kb-chat-analysis .ca-answer-text':'.kb-chat-analysis .ca-think-text');
      if(!box)return renderFresh();
      const partial=(s.part==='answer'?state.chatAnswer||'':state.chatThinking||'').slice(0,s.chars);
      if(box.classList.contains('ca-md'))box.innerHTML=mdHtml(partial,cursor.outerHTML);
      else {box.textContent=partial;box.appendChild(cursor);}
    } else if(s.card>=0){
      const item=state.results[s.card];
      if(!item)return;
      const card=document.querySelector(`.kb-chat-analysis .ca-card[data-ca="${s.card}"]`);
      if(!card)return renderFresh();
      const titleSpan=card.querySelector('.ca-title-text');
      const replyP=card.querySelector('.ca-card-reply');
      const replySpan=replyP?.querySelector('.ca-reply-text');
      if(s.part==='title'){
        const shown=item.title.slice(0,s.chars);
        if(titleSpan.textContent!==shown)titleSpan.textContent=shown;
        titleSpan.appendChild(cursor);
        if(replyP){if(replySpan)replySpan.textContent='';replyP.hidden=true;}
      } else {
        if(titleSpan.textContent!==item.title)titleSpan.textContent=item.title;
        if(replyP){replyP.hidden=false;if(replySpan){replySpan.textContent=item.reply.slice(0,s.chars);replySpan.appendChild(cursor);}}
      }
    }
    const body=$('.ca-body');
    if(body)body.scrollTop=body.scrollHeight;
  }
  /* 手机顶部状态栏、宿主 App、键盘顶部菜单栏 / 候选词栏、按键区、底部导航栏
     的渲染逻辑已拆成组件：components/shared/ 三端共用，components/{harmony,android,ios}/ 平台实现。 */
  /* 通用底部卡片（sheet）。closeAction 是右上角 X 的动作，默认 'close'（各弹层的通用关闭）。
     原协议正文覆盖层（legalSheet + 'app-legal-close'）已随 2026-10-04 需求改成整页
     （见 appLegalPage）—— 通用 sheet 现在剩三处使用方：「仿真控制台」、
     「用户」页的性别 / 出生日期两处就地编辑弹层（见 userSheet）与
     「我的」·「支持」·「联系客服」弹层（2026-10-04 需求，见 supportSheet）。 */
  const sheet = (title,body,footer='',closeAction='close') => `<div class="modal-backdrop"><section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="sheet-handle"></div><div class="sheet-header"><h2>${title}</h2>${ib('Close','关闭弹窗',closeAction)}</div><div class="sheet-content">${body}</div>${footer?`<div class="sheet-footer">${footer}</div>`:''}</section></div>`;
  function renderModal() {
    const m = state.modal;
    /* 「仿真控制台」弹层：入口只有键盘形态窄屏工具条的「仿真设置」按钮（主 App 形态的右栏
       APP STATE 与其「仿真控制台」入口 2026-09-29 已按需求删除 —— 那一形态不再可达这一层；
       底部的「重置全部本地仿真数据」按钮 2026-10-03 已按需求删除 —— 弹层只剩模拟开关与两颗演示按钮） */
    if (m==='simulator') return sheet('仿真控制台',`<div class="hint-banner">所有接口在当前页面内模拟。不会发送短信、上传图片或发起真实交易。</div>${simControls()}<div class="button-pair"><button class="secondary" data-action="incoming">收到新消息</button><button class="secondary" data-action="sim-screenshot">模拟截屏</button></div>`);
    /* 说明：对象列表（partners）与对象新增 / 编辑（partner-edit）两个屏已归属「对象」Tab，
       一律由 appScreenContent 直接渲染整页（appPartnersPage / partnerEditor），不在这里出分支；
       另外「我的」（account）也同样走 appAccountPage。这里只留子页的 sheet 卡片。
       原「键盘设置」（settings）与「确认模拟订单 / 权益已到账 / 模拟订单 / 兑换积分 / 我的反馈 /
       协议正文」各页的分支已于 2026-09-26 按需求删除（协议正文当时改走 legalSheet 覆盖层，
       2026-10-04 起再改回**整页** appLegalPage，都不经过这里）；
       同日稍后「登录 LoveCo」「会员与积分」两页也删除 —— 登录改弹键盘同款登录覆盖层
       （kb-login 组件，见 openKbLogin / needLogin），会员开通改弹键盘同款付费覆盖层
       （kb-paywall 组件，见 openPaywall），都不再是这里的 sheet 卡片；
       登录 2026-09-29 起又改回独立页面（appScreen='login'，见 openAppLogin），也不经过这里。
       「个人资料」（profile）的编辑表单卡片（昵称 / 性别 / 年龄段 + 保存资料）2026-10-04
       按需求整体删除 —— 该页改成整页结构的「用户」（见 appScreenContent / appUserPage），
       不在这里出分支；它的两处就地编辑弹层另走 renderApp 的 state.userSheet 挂点（userSheet()）。
       「协议中心」（legal-list）原是本工具里的一张 sheet（标题行 + 8 个行按钮），2026-10-04 需求起
       改过整页（appLegalListPage）、**同日稍晚该页按需求整体删除**（手机里的入口与页面一并去掉）。
       「反馈与建议」原是本工具里最后一张 sheet 卡片（投诉说明横幅 + 类型下拉 + 详细说明 +
       提交按钮），2026-10-04 需求起照设计图重做成**深色整页**「问题反馈」
       （appFeedbackPage，类型改胶囊排、描述 1000 字 + 联系方式 200 字都带实时计数），
       分支一并撤掉 —— 这一层现在只剩「仿真控制台」。 */
    /* 原「重置会话」的通用确认弹层（m==='confirm' + confirm-action 动作）随重置功能一起于
       2026-10-03 按需求删除 —— 工作台现在没有二次确认弹窗，勿补回。 */
    /* 分支只覆盖「仿真控制台」；其余 m 都是整页（见 appScreenContent），没有兜底卡片 */
    return '';
  }
  function openModal(name,data={}) {
    abortVoiceHold();
    /* 主 App 形态：记下这张卡片的来源页（Tab 三页 / 子页），供「取消 / 关闭」回上一层 ——
       主 App 现在有自己的页面栈（不再是「关掉就退回键盘形态」）。走 modalBack 的记法；
       协议正文 2026-10-04 起是**整页**（走 openAppScreen，来路记在 state.legalFrom），
       不进这个栈。 */
    if(state.appView==='app'&&state.appScreen&&state.appScreen!==name)state.modalBack={modal:state.appScreen,data:{...state.modalData}};
    state.modal=name;state.modalData=data;
    if(state.appView==='app') state.appScreen=name;
    render();
    const focus = {'partner-edit':'#partner-name'}[name];
    if(focus) setTimeout(()=>$(focus)?.focus({preventScroll:true}),30);
  }
  function closeModal() {
    abortVoiceHold();
    /* 主 App 形态的兜底落点：已登录回「我的」、未登录回首页（原「未登录落登录页」随该整页删除；
       主 App 的「取消 / 关闭」正常走 modalBack 回原页，见 close 动作） */
    if(state.appView==='app') { state.appScreen=state.loggedIn?'account':'home'; state.modal=state.appScreen; state.modalData={}; render(); return; }
    state.modal=null;state.modalData={};render();
  }
  /* —— 「选好截图 → 分析」这条链路的共同落点 ——
     三个调用方：键盘选择器的「立即分析」（attach-photos）、菜单栏的「待分析截图」缩略图
     （pending-shot）、以及键盘激活时的「模拟截屏」（takeScreenshot）。
     先把面板原地换成「AI 分析」过渡动画页（kb-scan，同一块皮肤、约 1 秒），同时把截图交给
     上传仿真接口，转写结果作为本次 AI 请求的输入（state.draft）；过渡播完由 finishScan()
     切到聊天分析面板 —— 之后的流程与「立即分析」完全一样。
     这里不把编辑面板弹回来（photoBack 清掉）：用户已经走进 AI 分析链路，不回编辑面板。 */
  function analyzePhotos(photos) {
    state.photoPanel=false;state.photoBack='';closeModal();
    openScanPanel();
    return runMutation('/v1/uploads/complete',{files:photos.map(p=>({name:p.name,simulated:true}))},()=>{
      const transcript=photos
        .flatMap(p=>Array.isArray(p.messages)?p.messages:[])
        .filter(Boolean)
        .join('\n');
      /* 截图转写只作为本次请求的输入（state.draft，跟着面板生命周期走：
         面板里的「重新生成」带上同一份上下文，面板关闭即清） */
      state.draft=(transcript||`请分析图片中的聊天记录：${photos.map(p=>p.name).join('、')}`).slice(0,1500);
      state.draftKind='chat';   /* 截图链路的结果恒为三组建议（与语音追问那种结构区分开） */
      state.results=[];state.photoPanel=false;closeModal();
      setTimeout(()=>generate(),0);
    },{onError:closeChatPanel});
  }
  /* 打开键盘选择器（「选择聊天截图（最多3张）」）：原「图片与最近截图」弹层（gallery）已随左栏
    「模拟聊天截图」入口一起移除，所有选图入口统一收敛到这里；preselect 是打开时预选中的截图 id
     （当前调用方都传空数组，参数保留备用） */
  function openPhotoPanel(preselect=[], mode='chat') {
    abortVoiceHold();state.modal=null;state.partnerPanel=false;state.settingsPanel=false;dismissChatPanel();
    /* 从对象编辑面板进来的（头像槽 / 编辑面板里点菜单栏相册图标）：选择器要铺满整个键盘区域，
       先把编辑面板收起并记住来源 —— 关闭 / 确定时再由 closePhotoPanel 弹回来；
       面板收起时表单草稿仍留在 modalData 里（头像模式本来就不能清，从编辑面板开聊天截图模式同理）。
       不是在编辑面板上打开的（菜单栏相册入口等），才把弹层草稿清掉。
       问AI 页里的图片按钮**不走这里**（那条路打开的是内嵌形态 kb-photo-picker 的 free-picker 分支，
       只盖键区、不铺满整个键盘，见 openFreePicker）；这里仍把这一页收掉，
       免得「键盘底座上还开着问AI 页、上面又压一层整页选择器」。 */
    state.photoBack=state.kbEditor?'kb-editor':'';
    if(!state.kbEditor)state.modalData={};
    dismissKbEditor();
    dismissFreeChat();
    state.photoMode=mode;state.selectedPhotos=preselect;state.photoPanel=true;state.pickerEnter=true;
    render();state.pickerEnter=false;
  }
  /* 问AI 页输入框上方的快捷栏（见 components/shared/kb-free-chat.js）：**点一下立即发送**
     （pickFreeShortcut）。**点的那一条决定结果结构**（sendFreeChat 的 kind）：
     'reply'（帮我回）→ 聊天分析（关系简报 + 三组建议）；其余 → AI通用回复。
     同一个场景还有「按住提问输入框多久算按住说话」的阈值（FREE_HOLD_MS）：短按仍是聚焦 / 放光标
     （点框同时收起图片选择器），按住不松才转成语音（见 startFreeVoiceWatch）。 */
  const FREE_SHORTCUTS = [
    {id:'reply', label:'帮我回'},
    {id:'polish', label:'这样回复如何'},
    {id:'last', label:'我最后一轮回复的如何'}
  ];
  const FREE_HOLD_MS = 260;
  /* —— 问AI 页（kb-free-chat 组件）：与 AI 对话的页面 ——
     入口是键盘菜单栏相册（图片）图标左侧的气泡按钮（动作 free-chat）；出口是标题栏的 X
     （动作 close-free-chat）与 Esc。它不是覆盖层：键盘顶部换成「问AI」标题栏 + 提问输入行
     （中间还有常驻的快捷栏，选中过图片时再加一行缩略图行），键区照常在下（标题栏顶替菜单栏、同高，
     整块键盘按输入区的实际高度往上长，见 theme.css 的 .keyboard.free-chat）；
     这一页打开时键区打字的目标就是那行提问输入框（见 typingInFree）。
     打开前把其它键盘层收掉（同一时刻只留一层）；输入内容不重置（用户的话留在 freeText 里）。 */
  function openFreeChat() {
    abortVoiceHold();
    state.modal=null;state.modalData={};
    state.partnerPanel=false;state.settingsPanel=false;state.photoPanel=false;state.photoBack='';
    state.partnersEmptyDemo=false;
    stopScan();
    dismissChatPanel();
    dismissKbEditor();
    /* 以菜单栏第一状态进入这一页：候选词栏 / 数字 · 符号层都退回字母层 ——
       与「从页面列表点进某个键盘页面」一样，进来就是干净的底座 + 这一页；
       图片选择器也收起（这一页默认是「标题栏 + 输入行 + 键区」的样子） */
    state.typing=false;state.composition='';state.t9Path=0;state.layer='letters';
    state.freePicker=false;
    state.freeChat=true;state.freeCaret=state.freeText.length;state.pickerEnter=true;render();state.pickerEnter=false;
  }
  /* 收起问AI 页（不开别的东西）：输入法状态一并清干净 —— 组合串与打字态属于这一页，
     留着会串到宿主输入框（显示值里会插进拼音字母、下划线画到别人的框里，与 dismissKbEditor 同理）；
     图片选择器也随这一页收起，按住说话的计时器一起摘掉。
     提问输入框的内容、已选截图同样留着（和那句话是同一份草稿：收起的是键盘 / 页面，
     不是用户打的字、挑的图），发送成功后才由 sendFreeChat 清空。 */
  function dismissFreeChat() {
    clearTimeout(state.freeHoldTimer);state.freeHoldTimer=null;
    if(!state.freeChat)return;
    state.freeChat=false;state.freePicker=false;
    state.composition='';state.t9Path=0;state.typing=false;
  }
  /* 标题栏的 X / Esc：收起这一页，回到干净键盘页（菜单栏 + 键区） */
  function closeFreeChat() { dismissFreeChat();render(); }
  /* —— 问AI 页里的图片选择器（kb-photo-picker 的内嵌形态）——
     点输入行右端的图片按钮 / 缩略图行的「+」展开：输入行**下方**的整块键区换成三列截图网格，
     从底部往上滑出、盖住键区（超出可滚动，见 theme.css 的 .free-picker）；关闭的出口是
     点输入框（老习惯：点输入框 = 回到键盘页，见 bind 里 #free-chat 的 click）与 Esc，
     再点一次图片按钮也是收起（同一枚按钮的开 / 关）。选图仍走选择器的 photo:<id> 动作，
     已选图片最多 3 张，缩略图行与网格读的是同一份 state.selectedPhotos。 */
  function openFreePicker() {
    if(!state.freeChat||state.freePicker)return;
    state.freePicker=true;state.pickerEnter=true;render();state.pickerEnter=false;
  }
  function closeFreePicker() {
    if(!state.freePicker)return;
    state.freePicker=false;render();
  }
  function toggleFreePicker() { if(state.freePicker)closeFreePicker();else openFreePicker(); }
  /* 快捷栏（帮我回 / 这样回复如何 / 我最后一轮回复的如何）：**点一下立即发送** ——
     点哪条决定结果结构（见 sendFreeChat 里的 kind）：「帮我回」→ 聊天分析（关系简报 + 三组建议），
     其余 → AI通用回复。组合串非空时先上屏（与键区那颗蓝键、Enter 一致，不丢未确认的拼音）。
     这一栏**常驻**（2026-10-06 晚些需求，此前只在选中过截图时出现），所以会出现
     「既没打字、也没附图」就点它的情况 —— 那时把这句短语本身当作本次提问（否则这一下什么都不会发生，
     见 sendFreeChat / appAiSend 里「输入与截图都为空不发」那道闸）；有字 / 有图时仍按原样发。
     state.freeShortcut 只是发送那一刻的入参（sendFreeChat 自己也会清），这里再兜一次 ——
     发送被跳过时也不留下，免得影响下一次从蓝键发出的结果结构。 */
  function pickFreeShortcut(id) {
    if(state.composition)commitComposition();
    if(!state.freeText.trim()&&!state.selectedPhotos.length){
      const q=FREE_SHORTCUTS.find(s=>s.id===id);
      if(q)state.freeText=q.label;
    }
    state.freeShortcut=id;
    sendFreeChat();
    state.freeShortcut='';
  }
  /* —— 「发送」在问AI 页里 = 把这次提问交给 AI ——
     四个入口同一条链路（键区右下角的蓝键 / Enter、图片选择器展开时输入行右端的蓝色发送按钮、
     快捷栏上任意一条短语、按住输入框说完松手）：先「AI 分析过渡页」，播完进聊天分析面板的生成中，
     最后由打字机输出结果。**本次结果的结构由刚点的那条快捷栏短语决定**（见 makeOutcome）：
       点了「帮我回」（state.freeShortcut = 'reply'）→ draftKind = 'chat'：聊天分析（关系简报 + 三组建议回复）；
       其余（含从蓝键 / 发送按钮 / 语音发的）→ draftKind = 'review'：AI通用回复
       （不写分析正文的关系简报卡 + 卡内两段 markdown）。
     发送的内容 = 输入的那句话 + 语音转写（由 submitFreeVoice 先并进 freeText）+ 已选截图：
     带截图时先走一遍上传仿真（/v1/uploads/complete，与「立即分析」同一条链路），
     截图的转写作为本次请求的输入并入 draft；输入与截图都为空时不发送。
     发送后这一页收起、输入 / 截图 / 快捷栏入参一并清空（结果由面板承接，面板关闭即回干净键盘页）。 */
  function sendFreeChat() {
    /* 主 App「AI 咨询师」页（appAiPage）与键盘共用这条发送链路：主 App 里不弹过渡页 / 分析面板，
       改写进会话记录（appAiSend —— 「正在输入」→ AI 回复接在同一条聊天里），见其函数头 */
    if(state.appView==='app')return appAiSend();
    const text=state.freeText.trim();
    const photos=state.selectedPhotos.map(id=>photoItems().find(s=>s.id===id)).filter(Boolean);
    if(!text&&!photos.length)return;
    const kind=state.freeShortcut==='reply'?'chat':'review';
    if(state.pending)cancelAI(true);
    dismissFreeChat();
    state.freeText='';state.freeCaret=0;
    state.selectedPhotos=[];state.freeShortcut='';
    openScanPanel();                  /* 先「AI 分析过渡页」，播完再进面板生成中 */
    if(!photos.length){
      state.draft=text;state.draftKind=kind;
      setTimeout(()=>generate(),0);
      return;
    }
    return runMutation('/v1/uploads/complete',{files:photos.map(p=>({name:p.name,simulated:true}))},()=>{
      const transcript=photos.flatMap(p=>Array.isArray(p.messages)?p.messages:[]).filter(Boolean).join('\n');
      const pic=transcript||`请分析图片中的聊天记录：${photos.map(p=>p.name).join('、')}`;
      state.draft=(text?text+'\n':'')+pic;
      state.draftKind=kind;
      setTimeout(()=>generate(),0);
    },{onError:closeChatPanel});
  }
  /* 键盘模式的新增 / 编辑聊天对象面板（kb-partner-editor）：替代弹层的覆盖层，皮肤与聊天分析
     / 选图面板同一套（键盘拉高到三分之二屏，面板只占上半、下半是键盘）。data 可带 {id} 进入编辑态。 */
  function openKbEditor(data={}) {
    abortVoiceHold();state.modal=null;state.modalData=data;state.partnerPanel=false;state.settingsPanel=false;state.photoPanel=false;state.photoBack='';dismissChatPanel();
    /* 问AI 页与编辑面板互斥（两者都要用键盘顶部 + 键区，见 typingInFree / typingInPartner）；
       从管理页新建 / 编辑时这一页先收起（与开选图选择器同理） */
    dismissFreeChat();
    state.kbEditor=true;state.partnerCaret=null;state.pickerEnter=true;render();state.pickerEnter=false;
    /* 光标默认落在「备注名」（贴末尾）：打开面板就能直接打字 —— 键区打字的目标也是它 */
    setTimeout(()=>{const el=$('#partner-name');if(!el)return;el.focus({preventScroll:true});try{el.setSelectionRange(el.value.length,el.value.length);}catch(_){}},80);
  }
  /* 键盘编辑面板的静默保存（确定键已移除）：称呼 / 关系阶段 / 头像一有变化即自动保存。
     scheduleKbPartnerSave 输入防抖 600ms 后走仿真请求（成功不提示、不跳页，面板留在原地继续编辑）；
     kbSaveSeq 序号作废时序 —— 后续修改 / 关闭兜底落库后，在飞请求的回调不再回写旧值。
     settleKbPartner 在关闭面板（X / Esc）时兜底：清掉防抖、把最终值直接本地落库（请求可能正忙，
     兜底不能等）；重名则跳过不落库（不提示）。新增态称呼为空不建对象。 */
  function kbPartnerSnapshot() {
    const prev=state.partners.find(p=>p.id===state.modalData.id);
    /* 名字读状态而不是输入框的显示值：显示值里可能带着未确认的组合串（键区打拼音时的字母） */
    const n=partnerBaseName().trim();
    const stage=normalizeStage($('#partner-stage')?.value??state.modalData.stage??prev?.stage);
    state.modalData.name=n;state.modalData.stage=stage;
    return {prev,n,stage,gender:prev?.gender||'暂不设置',note:prev?.note||'',avatar:state.modalData.avatar||prev?.avatar||''};
  }
  function applyKbPartner(s) {
    let p=state.partners.find(x=>x.id===state.modalData.id);
    if(p)Object.assign(p,{name:s.n,gender:s.gender,stage:s.stage,note:s.note,avatar:s.avatar});
    else p={id:'p'+Date.now(),name:s.n,gender:s.gender,stage:s.stage,note:s.note,color:'blue',avatar:s.avatar};
    state.modalData.id=p.id;
    frontPartner(p);
    persist();
  }
  function scheduleKbPartnerSave() {
    clearTimeout(state.kbSaveTimer);
    const seq=state.kbSaveSeq=(state.kbSaveSeq||0)+1;
    state.kbSaveTimer=setTimeout(()=>{
      const s=kbPartnerSnapshot();
      if(!s.n)return;
      /* 重名静默跳过（等用户改回 / 关闭兜底时提示），不发请求 */
      if(state.partners.some(p=>p.name===s.n&&p.id!==state.modalData.id))return;
      runMutation('/v1/partners'+(state.modalData.id?'/'+state.modalData.id:''),{name:s.n,gender:s.gender,stage:s.stage,note:s.note},()=>{
        if(seq!==state.kbSaveSeq)return;
        applyKbPartner(s);render();
      },{method:state.modalData.id?'PATCH':'POST'});
    },600);
  }
  function settleKbPartner() {
    clearTimeout(state.kbSaveTimer);
    state.kbSaveSeq=(state.kbSaveSeq||0)+1;
    const s=kbPartnerSnapshot();
    if(!s.n)return;
    if(state.partners.some(p=>p.name===s.n&&p.id!==state.modalData.id))return;
    applyKbPartner(s);
  }
  /* 收起对象编辑面板（从编辑面板切到别的覆盖层 / 页面时用）：与 X / Esc 一样先兜底落库再收起，
     否则防抖还没到的改动会随 modalData 一起被下一层清掉。注意只是在「收起」时调用 ——
     关闭选图面板把面板弹回来那条路（closePhotoPanel）不走这里。 */
  function dismissKbEditor() {
    if(!state.kbEditor)return;
    settleKbPartner();
    state.kbEditor=false;
    /* 连带把输入法状态收干净：组合串与打字态属于这个面板，留着会串到宿主输入框
       （显示值里会插进拼音字母、下划线画到别人的框里） */
    state.composition='';state.t9Path=0;state.typing=false;
  }
  /* 关闭编辑面板并回聊天对象管理页：面板 X / Esc、键区功能键「确定」共用同一条出口 ——
     先兜底落库（dismissKbEditor 内的 settleKbPartner）再回列表；
     新增态名字为空时 settleKbPartner 不建对象，确定等价于放弃。
     设置页与面板是上下分区的一套（打开时面板留守），面板关掉时把设置页一并收起，
     否则会留下「管理页 + 下半设置页」的层叠。 */
  function closeKbEditor() {
    dismissKbEditor();
    state.settingsPanel=false;
    state.photoBack='';
    state.partnerPanel=true;
  }
  /* 关闭选图面板：从编辑面板进来的（头像模式 / 编辑面板里的菜单栏相册图标）就把它弹回去，
     草稿在 modalData 里不丢；在键盘底座上打开的（菜单栏相册入口）就是单纯收起。 */
  function closePhotoPanel() {
    state.photoPanel=false;state.photoMode='chat';
    if(state.photoBack==='kb-editor')state.kbEditor=true;
    state.photoBack='';
    render();
  }
  /* 对象增改删后的返回点：主 App 形态回整页列表；键盘形态统一回到聊天对象管理页
     （键盘弹层入口已删除，列表只存在于管理页覆盖层） */
  function backToPartners() {
    if(state.appView==='app')return openAppScreen('partners');
    /* 顺带摘掉「空列表」演示标记：从空态演示里新建 / 编辑 / 删除后回来的应是真实列表 */
    state.partnersEmptyDemo=false;
    state.modal=null;state.modalData={};state.partnerPanel=true;render();
  }
  function openAppScreen(screen,data={}) {
    abortVoiceHold();dismissKbEditor();
    /* 换页一律收起只服务某一页的浮层：键盘切换悬浮窗（它挂在引导页上，换页不该跟着走）、
       iOS 系统支付框（只为当次购买服务）、「用户」页的编辑弹层（state.userSheet）、
       注销页的「注销申请成功」弹框（state.cancelAsk）、
       「会员购买页 · 新」的协议确认框（state.pu2Ask）、「永久会员立减优惠」挽留弹窗
       （state.pu2Offer）与它的「兑换码」半屏弹层（state.redeemSheet）、
       「我的」页的「联系客服」弹层（state.supportSheet）一并收起。
       （主 App 的协议正文 2026-10-04 起是**整页**，不再是浮层 —— state.appLegal 已删。） */
    state.iosPaySheet=false;
    state.userSheet='';
    state.cancelAsk=false;
    state.pu2Ask=false;
    /* 挽留弹窗收起的同时停掉它的倒计时（定时器不跟着换页继续跑） */
    state.pu2Offer=false; stopOfferTimer();
    state.redeemSheet=false; state.redeemDraft=''; state.redeemError=''; state.redeemDone=null;
    state.supportSheet=false;
    state.kbImeSwitch=false;
    /* 键盘选择器（「切换到 LoveCo 键盘」页上的浮层）同理：换页不该跟着走 */
    state.kbSwitchPicker=false;
    state.partnerPanel=false; state.settingsPanel=false; state.photoPanel=false; state.photoBack=''; dismissChatPanel();
    /* 主 App「AI 咨询师」页底部区的两个开关（调出的键盘 / 底部弹窗）也是「只服务那一页的浮层」：
       换页（含由 openAppAi 进站）一律复位 —— 进来 / 离开都是干净的贴底输入栏 */
    state.aaiKb=false; state.aaiSheet='';
    /* 「问题反馈」页每次进来开一张**新表单**（设计图上进来就是空表单）：问题类型取入口预选
       （FEEDBACK_TYPES 里的值，没有 / 不认就落「功能问题」—— 2026-10-04 晚些起唯一来路
       「我的 · 支持 · 反馈与建议」不传，进来即默认档；原「键盘内容投诉与举报」那条预选
       来路随该行删除一并撤掉），问题描述与联系方式清空。
       原 sheet 那套「上一次的草稿留在 formCache 里」的做法随页面重做一并撤掉。 */
    if(screen==='feedback'){
      state.feedbackType=FEEDBACK_TYPES.includes(data.type)?data.type:FEEDBACK_TYPES[0];
      state.feedbackText='';state.feedbackContact='';
    }
    /* 「邀请有礼」页每次进来也开一张新表单（同 feedback 口径）：填写区草稿与校验提示清空、
       规则回到收起态、两枚复制按钮的即时反馈复位；邀请记录与领取记录是存档数据，不清。 */
    if(screen==='invite'){
      state.inviteDraft='';state.inviteError='';state.inviteRulesOpen=false;state.inviteCopied='';
    }
    /* 会员购买页每次进来都摆成默认态：支付渠道回到首选支付宝（安卓 / 鸿蒙的默认渠道 —— 与
       「首选支付宝、只存内存、每次进页回默认」的口径一致；2026-10-05 补上这句显式复位，此前靠的
       是「默认值恰为 alipay」的隐式行为）；再把选中档位摆回**永久会员**（2026-10-06 晚些
       需求：原摆回季度）、协议勾选框摆回未勾选、协议确认框收起（照设计图与最新需求的默认态）。
       **2026-10-06 再加一句 pu2Launch 复位**（这一页是不是「打开 App 自动弹出的那一次」——
       手动入口一律当成不是，出口叉号 / Esc 照旧走「是否弹挽留弹窗」那条判定；
       自动弹出那次由 launchPaywall 在本次 openAppScreen **之后**才置 true，见 leavePurchasePage）。
       **2026-10-06 起主 App 只剩「会员购买页 · 新」purchase2-copy 一张购买页**（第一个购买页
       purchase 与第二个 purchase2 同日已按需求整页删除），这句只服务它。 */
    if(screen==='purchase2-copy'){state.purchasePay='alipay';state.pu2Plan='permanent';state.pu2Agreed=false;state.pu2Ask=false;state.pu2Launch=false;}
    /* 离开「会员购买页 · 新」= 首启那最后一轮（含点 x 必弹的优惠券挽留）走完了 —— 「首启引导」
       开关到这儿才复位成关（2026-10-06 再晚些需求：落到首页不算结束，见 state.firstLaunchTail）。
       买成 / 放弃购买都算走完：用户不再耗在这一轮里了。 */
    if(state.firstLaunchTail && state.appScreen==='purchase2-copy' && screen!=='purchase2-copy')finishFirstLaunch();
    state.appView='app'; state.appScreen=screen; state.modal=screen; state.modalData=data; render();
    /* 「问题反馈」页进来**不自动聚焦描述框**：设计图上没有键盘（原 sheet 卡片会自动聚焦，
       整页形态下那会把键盘顶起来、盖住半页），要打字点一下输入框即可 */
  }
  /* 返回键盘形态：从主 App 回来一律落在「键盘常驻」的底座上 —— 收起态只属于宿主会话里的一次收起动作
     （切回键盘也等于离开了「会员购买页 · 新」：首启那一轮同样到此为止，见 firstLaunchTail）；
     切形态 = 离开主 App 里正在走的引导链路，演示待演标记（guideDemoPending）一并清掉 */
  function returnKeyboard() { if(state.firstLaunchTail)finishFirstLaunch(); abortVoiceHold();dismissKbEditor();dismissFreeChat(); state.iosPaySheet=false; state.kbCollapsed=false; state.partnerPanel=false; state.settingsPanel=false; state.photoPanel=false; state.photoBack=''; dismissChatPanel(); state.appView='keyboard'; state.appScreen=null; state.modal=null; state.modalData={}; state.kbGuidePage=''; state.kbImeSwitch=false; state.kbSwitchPicker=false; state.guideDemoPending=false; render(); }
  /* 「打开 App 自动弹会员购买页」的延时：**落到首页后等 1 秒**再从底部弹出（2026-10-06 需求，
     见 launchPaywall；原来是不延时、落首页那一刻直接切页） */
  const LAUNCH_PAYWALL_DELAY_MS = 1000;
  /* —— 「打开 App 自动弹会员购买页」（launchPaywall，2026-10-06 需求）——
     每次打开 App（= 本机加载后的启动流程 / 工作台切到主 App 形态 / 引导与登录走完回到 App）
     **落到首页**那一刻：未开通会员（!state.member）就排一个**延时 1 秒**的弹出，弹出
     **「会员购买页 · 新」**（purchase2-copy，主 App 唯一的购买页，见 gotoAppPurchase）；
     已是会员、或本次启动已经排过（state.launchPaywallShown，内存不落库、刷新复位）就不再排。
     弹的时机一律在状态检查链（appEntryGuards）之后：键盘权限 / 完全访问 / 登录三道都过了、
     真要落首页时才排，引导页、登录页、资料引导与「键盘使用引导（演示）」上都不弹
     —— 2026-10-08 需求把演示挪到链路最后，引导链路里就是**演示收场**那一下（finishGuide）
     才排（四处落首页的链路：appEntryCheck、finishGuide、登录收尾回首页、finishOnboarding）。
     **2026-10-06 本轮需求（等 1 秒 + 从底部弹出 + x 回首页）**：
     ① 函数**不再立即切页、也不再挡渲染** —— 它只排定时器就返回 false，调用方照旧把首页
        渲染出来；满 1 秒再由定时器把购买页盖上来（`.pu2-page.entering` 整页从底部滑入，
        见 appPurchasePlusCopyPage）。这一秒里用户已经离开首页（切了 Tab / 切键盘形态 /
        打开了别的页）就放弃这次弹出，不再补弹。
     ② 弹出时置 pu2Launch —— 这一页的出口（叉号 / Esc）直接回首页，见 leavePurchasePage。
     返回 false = 首页可以照常渲染（调用方那句 `if(launchPaywall())return;` 保留无害）。 */
  function launchPaywall() {
    if(state.member || state.launchPaywallShown)return false;
    state.launchPaywallShown = true;
    clearLaunchPaywallTimer();
    /* 首启引导还在进行就顺手把「首启尾巴」挂上（state.firstLaunchTail）—— 落到首页那几处调用的
       clearFirstLaunch 会被它挡下，开关保持亮着，等这一轮付费墙（购买页 → 优惠券挽留 → 退出回首页）
       走完才真的结束（2026-10-06 再晚些需求：首启结束时间往后延，见 finishFirstLaunch） */
    if(state.firstLaunch)state.firstLaunchTail = true;
    state.launchPaywallTimer = setTimeout(()=>{
      state.launchPaywallTimer=null;
      /* 这一秒里用户已经离开首页就不再拦（标记已用掉、本次启动不再补弹）——
         顺带把首启收尾：这一轮付费墙没排上、用户也没在等它，开关就此落回关 */
      if(state.appView!=='app' || state.appScreen!=='home'){
        if(state.firstLaunchTail){finishFirstLaunch();render();}
        return;
      }
      state.pu2Enter = true;   /* 滑入动画只播这一次：渲染完立刻复位 */
      openAppScreen('purchase2-copy');
      state.pu2Enter = false;
      state.pu2Launch = true;   /* 这次是自动弹出的：叉号 / Esc 直接回首页（见 leavePurchasePage） */
    }, LAUNCH_PAYWALL_DELAY_MS);
    return false;
  }
  /* 撤掉还没触发的「打开 App 自动弹购买页」定时器（firstLaunchReset 把设备摆回新机时调；
     没有待弹的定时器时什么都不做） */
  function clearLaunchPaywallTimer() { if(state.launchPaywallTimer){clearTimeout(state.launchPaywallTimer);state.launchPaywallTimer=null;} }
  /* —— 「模拟 › 首启引导」开关（2026-10-06 需求）——
     模拟「这台设备刚装上 App、第一次打开」这一场景：一键把设备摆回新机，再把主 App 送回
     进入引导。开 = 依次做三件事（关掉开关则什么都不做，只把 state.firstLaunch 落回 false）：
     ① **设备权限回新机**：开启键盘 / 键盘完全访问 关、当前输入法回系统默认、相册访问权限回
        「关闭」；只留「蜂窝网络」（网络访问 / 麦克风没有 UI 入口，照旧保持默认开）。
        与左栏那几颗开关的联动同一套（键盘一关，完全访问与当前输入法一并复位，见 #perm-kb-enabled）。
     ② **「模拟」组里的仿真开关全部复位**（含「已设置性别」—— 新设备的性别还没设置）：
        登录状态（连带在飞的请求、聊天结果、
        键盘侧那几层覆盖层：登录 / 协议正文 / 完全访问 / 付费 / 键盘切换悬浮窗 / 键盘使用引导演示）、
        模拟试用额度耗尽（照那颗开关自己的做法把原值快照还原）、会员状态（回「未开通」）、模拟安全拦截；
        主 App 侧的几层弹层（协议确认 / 优惠挽留 / 兑换码 / 客服 / 用户资料 / 注销确认）一并收起，
        「打开 App 自动弹购买页」的一次性标记（launchPaywallShown）也清掉 —— 这是一次新的
        「打开 App」，走完引导落到首页时该弹还弹；**「已设置性别」也一并复位成关**（新设备 / 新账号，
        性别还没设置 —— 首启引导因此**一定**会进性别 / 出生日期那两页，走完再置成开）。
        「蜂窝网络」保持原样不动。
     ③ **切到主 App 并从头跑一遍进入检查**（appEntryCheck）：键盘没启用 → 整页落
        「开启键盘」引导页，后续完全访问 / 登录两环照常按状态往下走。
     开关只在页面内存、不落库（设备权限本身也不落库）；**走完整个首启链路（引导 → 登录 →
     资料引导 → 演示 → 首页；2026-10-08 需求把演示挪到链路最后）落到首页那一刻**才自动复位成关
     （见 clearFirstLaunch）—— 与「已设置性别」走完资料引导自动置开同一套生命周期口径
     （模拟的是一个一次性场景）。 */
  function firstLaunchReset() {
    state.firstLaunch = true;
    /* ① 设备权限回新机（只留蜂窝网络；网络访问 / 麦克风无 UI 入口、不动） */
    const P = state.permissions;
    P.kbEnabled = false; P.keyboard = false; P.ime = 'system'; P.photos = 'denied';
    /* 键盘侧挂着的那几层覆盖层一并收起（登录 / 协议正文 / 完全访问 / 付费 / 切换悬浮窗）；
       「键盘使用引导（演示）」层若还开着也收掉（连同引导待演标记，见 guideDemoPending） */
    closeKbLogin(); state.kbLoginCode=''; state.kbLoginSent=false; state.kbLoginBusy=false;
    closeKbFullAccess(); closeKbPaywall(); closeKbUsageGuideSilent();
    state.kbImeSwitch = false; state.kbSwitchPicker = false;
    /* ② 模拟开关复位：登录状态 / 模拟试用额度耗尽 / 会员状态（回未开通）/ 模拟安全拦截，
         外加「已设置性别」—— 新设备 = 性别还没设置，所以首启链路必然要过一遍资料引导 */
    cancelAI(true);
    state.accountEpoch++; state.loggedIn = false; state.results = [];
    if(state.creditsOut){
      const prev = state.creditsSnapshot || {credits:28,member:false,memberExpiry:null};
      state.credits = prev.credits;
      state.creditsOut = false; state.creditsSnapshot = null;
    }
    state.member = false; state.memberExpiry = null;
    state.outcome = 'success';
    /* 「已设置性别」复位成关（新设备 / 新账号，性别还没设置）—— 首启引导也因此**一定**会进
       性别 / 出生日期那两页（性别那一步不可跳过，见 finishKbLogin / onboardGenderPage）；
       走完由 finishOnboarding 再置成开 —— 所以首启正常结束时这颗开关一定是开的。 */
    state.genderSet = false;
    /* 主 App 侧的弹层 / 一次性标记一并复位（见上面 ② 的注释）—— 待弹的那 1 秒定时器也撤掉
       （这一轮是一次新的「打开 App」，走完引导落到首页时由 launchPaywall 重新排） */
    /* 首页「限时特惠」悬浮卡也一并收摊（新设备不该带着上一轮的 3 分钟资格） */
    state.pu2Ask = false; closeOfferSheet(); stopOfferBadge(); state.redeemSheet = false;
    state.supportSheet = false; state.userSheet = ''; state.cancelAsk = false;
    state.iosPaySheet = false; state.launchPaywallShown = false; state.pu2Enter = false; state.pu2Launch = false;
    state.firstLaunchOffer = false;
    clearLaunchPaywallTimer();
    persist();
    /* ③ 主 App：从头跑一遍进入检查 —— 键盘没启用，整页落「开启键盘」引导页 */
    state.docPage = null;
    appEntryCheck();
  }
  /* —— 「模拟 › 首启引导」开关的收尾（2026-10-06 晚些需求修正）——
     首启是一个**整条链路**的场景：开启键盘引导 → 登录 → 资料引导 → 键盘使用引导演示 →
     首页 → **自动弹出的付费墙那一轮**（2026-10-08 需求把演示挪到链路最后）。链路里任何一站
     （键盘引导完成那一刻、登录页、资料引导页、演示中的整机、刚落地的首页）都还在这个
     场景里，开关必须保持打开。
     **2026-10-06 再晚些需求：结束时机往后延** —— 落到首页那一刻**不再立即关**：那之后还要等
     1 秒弹出「会员购买页 · 新」、点 x 再必弹「优惠券挽留」，这一整轮走完（用户退出购买页、
     回到首页）才真的把开关关上。实现见 state.firstLaunchTail —— 落首页时若排了自动付费墙就把
     「结束」挂起，clearFirstLaunch 见到这枚标记就什么都不做，由下列时机真收尾（finishFirstLaunch）：
       · 离开「会员购买页 · 新」（openAppScreen / returnKeyboard）—— 买成 / 放弃购买都算走完；
       · 那一秒里用户已经不在首页、这次自动弹出被放弃（launchPaywall）。
     四处落点都调 clearFirstLaunch（幂等，开关本来就关时什么都不做）：
       · finishGuide —— 检查链三环全过、这一步真落首页；
       · finishKbLogin —— 登录收尾回来路，来路正好是首页；
       · closeAppLogin —— 登录页 X / Esc 退出回到首页；
       · finishOnboarding —— 资料引导走完（紧跟着才排自动付费墙，见那里的调用顺序）。
     只在页面内存、不落库（开关本身就不落库）。 */
  /* clearFirstLaunch 顺手把「本次启动走的是首启引导链路」这个标记翻上（firstLaunchOffer）——
     开关在**落首页那一刻**就关了，而首启链路里弹付费墙恰恰是落首页 1 秒之后的事（launchPaywall），
     所以「首启引导必弹挽留弹窗」这条判定不能只看开关（见 leavePurchasePage）。
     **首启尾巴还挂着时什么都不做**（那一轮付费墙没走完，见 state.firstLaunchTail）；
     **开关本来就是关的也原样返回** —— 这四处落点都是无条件调的（单走一遍登录 / 资料引导也会
     经过它们），那种情况下不能留下「本次启动走过首启」的印记，否则之后手动进购买页会一直享受
     「必弹」、1/4 随机那条形同虚设。 */
  function clearFirstLaunch() { if(state.firstLaunchTail || !state.firstLaunch)return; state.firstLaunch = false; state.firstLaunchOffer = true; }
  /* 真收尾：首启尾巴、开关与「本次启动走过首启」三个标记一并落回 false —— 这一轮无论如何到此为止
     （之后手动进「会员购买页 · 新」不再享受「首启必弹挽留」，照 1/4 随机那条口径） */
  function finishFirstLaunch() { state.firstLaunchTail=false; state.firstLaunch=false; state.firstLaunchOffer=false; }
  /* —— 主 App 的进入检查（进入 / 切入主 App 时都要过一遍）——
     2026-09-28 按需求去掉「正在检查网络…」整页（连同那圈转动画）—— 进入主 App 不再先发仿真
     网络请求查联网状态，直接按状态检查链（见 appEntryGuards）走一遍：键盘权限 → 完全访问权限 →
     登录状态，哪一环没过就停在对应的引导上，都通过才落首页。
     引导页算「主 App 自己的整页」，落在 appScreen='kb-guide' 上（无底部 Tab）。 */
  function appEntryCheck() {
    state.appView='app'; state.appScreen='home'; state.modal='home'; state.kbGuidePage='';
    /* 这一次是「重新进入主 App」（启动 / 切形态 / 重开首启）：上一次引导链路若中断在这儿，
       演示待演标记不跟着走（首启链路自己从 firstLaunchReset 起步，不经过这里） */
    state.guideDemoPending = false;
    if(appEntryGuards())return;
    /* 打开 App 的自动付费墙（见 launchPaywall）：检查链都过了、真要落首页时才排那次弹出
       （等 1 秒从底部滑入，见 LAUNCH_PAYWALL_DELAY_MS）；照旧把首页渲染出来 */
    if(launchPaywall())return;
    render();
  }
  /* —— 主 App 的状态检查链（进入主 App / 引导完成等时机按序跑一遍）——
     顺序（2026-09-28 按需求定）：① **键盘权限**（permissions.kbEnabled —— 键盘没启用就整页进
     「开启键盘」引导流程，kbGuidePage='guide'）→ ② **键盘完全访问权限**（iOS / 鸿蒙且未开时
     弹出「键盘完全访问引导页」，它浮在主 App 上；Android 系统上该权限默认开启，跳过这一环）→
     ③ **登录状态**（未登录进「手机号登录」独立页面，2026-09-29 起不再是覆盖层）。通过则检查下一个；没通过就停在对应的引导上
     （返回 true = 已经渲染过，调用方别再渲染）—— 与原来「落首页 + 补弹登录层」的差别就在于
     中间这道完全访问检查，且三层不再同时出现（先权限、后登录，与键盘侧同一套思路）。
     检查点三处：进入主 App（appEntryCheck：**启动缺省形态 / `?surface=app`** / 工作台切 App形态）、
     「开启键盘」引导完成那一刻（finishGuide —— 接着把后两环补完）、左栏「键盘完全访问」开关的
     仿真联动（与键盘侧 checkKbEntry 同一条链）。 */
  function appEntryGuards() {
    if(!state.permissions.kbEnabled){ state.appScreen='kb-guide'; state.modal='kb-guide'; state.kbGuidePage='guide'; render(); return true; }
    if(checkKbFullAccess())return true;
    if(checkKbLogin())return true;
    return false;
  }
  /* 引导页「启用LoveCo输入法」→ 模拟设置页（按运行平台渲染，见 appKbGuideScreen）：
     进模拟设置页时顺手收起键盘切换悬浮窗（它是引导页上的东西，不跟着进设置页） */
  function openGuideSettings() { state.kbImeSwitch=false; state.kbGuidePage='settings'; render(); }
  /* 模拟设置页点「LoveCo」行 → LoveCo 输入法详情页（两个开关） */
  function openGuideDetail() { state.kbImeSwitch=false; state.kbGuidePage='detail'; render(); }
  /* 引导页第二步「切换到LoveCo输入法」→ **键盘切换悬浮窗**（2026-09-28 需求，此前与第一步同一落点、
     进模拟设置页）：安卓系统不给 App 直接切输入法的权限，这一步的手感就是「点键盘上的切换按钮、
     在弹出的选择器里选 LoveCo」—— 那正是 ieSwitchSheet 仿的这一层（页面列表条目亦单独登记）。 */
  function openImeSwitch() { if(!state.permissions.kbEnabled) return; state.kbImeSwitch=true; render(); }
  /* 设置页 / 详情页的返回箭头：详情回设置（纯系统内导航），**设置页这一下 = 离开系统设置、
     回到 App** —— 也就是「App 回到前台」那一刻：主 App 在这里重新校验一遍权限
     （2026-09-28 需求收尾：这枚返回箭头接管原左栏「模拟 › 返回主 App」按钮的校验职责，
     那枚按钮已按需求删除 —— 从系统页面回 App 的路径只剩这枚返回箭头与左下角悬浮窗）：
     满足（键盘已启用 **且** 当前键盘已切成 LoveCo，见 guideSatisfied）就接着走引导的后半段
     （先补状态检查链后两环：完全访问 → 登录，再走资料引导，最后才是「键盘使用引导（演示）」，
     见 guideAfterSwitch —— 2026-10-08 需求把演示挪到最后）；没满足就落到该做的这一步
     —— 例外（2026-09-28 需求）：**回到 App 那一刻先检查一次键盘是否已启用**
     （真实设备上 App 回到前台也只能这时才知道），键盘已启用就切到第二步，落点按端分叉：
     安卓在引导页上自动弹出键盘切换悬浮窗（当前输入法已是 LoveCo 就不弹了，没什么可切的）；
     **iOS / 鸿蒙落到整页的「切换到 LoveCo 键盘」**（kbGuidePage='switch'，见 appGuideSwitch）——
     两端系统里没有「当前输入法」这种东西，第二步的手感就是「长按键盘上的地球把键盘切过来」。
     键盘还没启用则退回引导页接着做第一步。 */
  function guideBack() {
    if(state.kbGuidePage==='detail'){ state.kbGuidePage='settings'; return render(); }
    if(guideSatisfied()) return guideAfterSwitch();
    if(state.platform!=='android' && state.permissions.kbEnabled) return openKbSwitchPage();
    state.kbGuidePage='guide';
    state.kbImeSwitch = state.platform==='android' && state.permissions.kbEnabled && state.permissions.ime!=='loveco';
    render();
  }
  /* 模拟设置页「默认输入法」行：点一下在「小艺输入法」与「LoveCo」之间切换（= 在系统里改当前输入法）——
     只能选已启用的输入法（未启用时该行整行不可点），反向切回小艺不影响键盘的启用状态。
     切换本身不结束引导：完成仍在「回到 App」那一刻校验（设置页左上角返回箭头 / 悬浮窗，
     见 guideBack / guidePipBack）—— 这一页是模拟的系统页面，主 App 感知不到权限变化 */
  function switchGuideIme() {
    const P = state.permissions;
    if(P.ime==='loveco'){ P.ime='system'; return render(); }
    P.ime='loveco'; P.kbEnabled=true;
    render();
  }
  /* 详情页「启用LoveCo」开关 = permissions.kbEnabled（左栏「开启键盘」是同一个开关）：
     打开即键盘已启用，详情页就地显现第二个开关「完整体验模式」、悬浮窗浮出绿色对勾；
     关掉则键盘回到未启用：当前输入法不可能是 LoveCo，复位成系统默认；
     完全访问是键盘的权限，也一并复位（permissions.keyboard=false）—— 键盘都没启用，
     这个权限没有依附对象，左栏「设备权限 › 键盘完全访问」同步变关（2026-09-28 修复：
     此前关掉键盘后它仍是开的，两处显示错位）。
     **只改设备状态、不触发主 App 的任何检查**（2026-09-28 需求）：这一页是模拟的系统页面，
     主 App 感知不到权限变化 —— 不弹完全访问引导层、也不完成引导；"App 回前台重新校验"
     发生在明确的「回到 App」那一刻（设置页左上角返回箭头 / 左下角悬浮窗，见 guideBack / guidePipBack）。 */
  function toggleGuideEnable() {
    const P=state.permissions;
    P.kbEnabled=!P.kbEnabled;
    if(!P.kbEnabled){P.ime='system';P.keyboard=false;state.kbImeSwitch=false;}
    syncFullAccess();
    render();
  }
  /* 安卓没有「键盘完全访问」这个权限（系统侧默认就给到，`fullAccessGranted()` 一直按已开算）——
     因此**键盘一启用就视同连这个权限一起有了**（2026-09-28 需求）；停用则跟着复位（权限依附
     在键盘上，键盘没启用就不该开着，与 iOS / 鸿蒙那条「关键盘一并复位」同一套）。iOS / 鸿蒙下
     这两个权限各自独立，本函数不动它们。消费方：模拟设置页那颗「LoveCo 输入法」开关
     （toggleGuideEnable）、详情页「启用LoveCo」、左栏「设备权限 › 开启键盘」、切平台。 */
  function syncFullAccess() {
    if(state.platform==='android') state.permissions.keyboard = state.permissions.kbEnabled;
  }
  /* 键盘切换悬浮窗里选一个输入法（kb-guide-ime-pick:loveco / :system）＝ 在系统里把当前输入法切过去，
     随即收起这一层。选 LoveCo 时键盘必然已启用（悬浮窗本来只在键盘启用后出现），这里顺手补一句
     兜底；**收起这一层 = 回到 App**（系统选择器选完就退回 App）：两步都齐了（键盘已启用、安卓下
     当前输入法也已切成 LoveCo）＝ 第二步达成 —— **不落首页**，接着走引导的后半段（2026-10-08 需求：
     先补状态检查链后两环 → 资料引导 → 最后才是「键盘使用引导（演示）」，演示收场才算引导完成：
     回首页 + 等 1 秒弹会员购买页，见 guideAfterSwitch / closeKbUsageGuide；与 iOS / 鸿蒙在
     「切换到 LoveCo 键盘」页选完 LoveCo 是同一套走向）；
     只选回系统默认则留在引导页继续。 */
  function pickGuideIme(ime) {
    if(ime==='loveco') state.permissions.kbEnabled = true;
    state.permissions.ime = ime==='loveco' ? 'loveco' : 'system';
    syncFullAccess();
    state.kbImeSwitch=false;
    if(guideSatisfied()) return guideAfterSwitch();
    render();
  }
  /* 详情页「完整体验模式」开关（第二个开关，仅第一个打开后显现）= 完全访问权限本身
     （鸿蒙系统里这个权限就叫「完整体验模式」）：直接翻 permissions.keyboard ——
     与左栏「设备权限 › 键盘完全访问」是同一个开关，开 / 关两处同步（2026-09-28 需求：
     此前存在 kbGuideFull 里，开它左栏那颗开关不动，是 bug）。
     与第一个开关一样**只改设备状态**：不弹完全访问引导层、不完成引导（那发生在「回到 App」那一刻）。 */
  function toggleGuideFull() { state.permissions.keyboard=!state.permissions.keyboard; render(); }
  /* 悬浮窗（画中画）：点它 = 从系统设置**返回 LoveCo App** —— 这里重新校验一遍（guideSatisfied）：
     键盘已启用且当前键盘已切成 LoveCo 就接着走引导的后半段（登录 → 资料引导 → 演示，
     最后落首页，见 guideAfterSwitch）；
     还差第二步（键盘启用了但键盘还没切过来）则按端落到第二步：安卓回引导页（那儿会亮着第二步
     按钮，见 guideBack 的同一条判定）、iOS / 鸿蒙直接进「切换到 LoveCo 键盘」页。 */
  function guidePipBack() {
    if(guideSatisfied()) return guideAfterSwitch();
    if(state.platform!=='android' && state.permissions.kbEnabled) return openKbSwitchPage();
    state.kbGuidePage='guide'; render();
  }
  /* 引导完成（「键盘使用引导（演示）」收场时由 closeKbUsageGuide / gxAdvance 的 win 步调用）：
     回主 App 首页 —— 2026-10-08 需求把演示挪到链路最后，走到这儿时状态检查链的三环
     （键盘权限 / 完全访问 / 登录）与资料引导都已在前面的几站走过，这里补跑一遍守卫链
     （appEntryGuards）兜底，都通过才真正停在首页上、排「等 1 秒弹会员购买页」。
     「模拟 › 首启引导」开口径收尾（2026-10-06 晚些修正）：**不再是「这一次引导走完就关」** ——
     首启是一整条链路（开启键盘引导 → 登录 → 资料引导 → 演示 → 首页），走完演示时流程还没完，
     开关要一直亮着；只有这一轮检查链三环全过、真落到首页时才关（见 clearFirstLaunch）。
     其余来路的引导（左栏手开「开启键盘」等）不受影响（那时开关本来就是关的）。 */
  function finishGuide() {
    state.kbGuidePage='';
    state.kbImeSwitch=false;
    state.kbSwitchPicker=false;
    /* 这一轮引导到此为止：演示待演标记一并落回（兜底 —— 演示收场那条路已在
       closeKbUsageGuideSilent 里清过，见 guideDemoPending） */
    state.guideDemoPending=false;
    state.appScreen='home'; state.modal='home'; state.modalData={};
    /* 第一环过了，接着补后两环（完全访问 / 登录）：哪一环没过就还停在引导里，
       「首启引导」开关要继续亮着（见 clearFirstLaunch），等真落首页那一刻才关。
       **2026-10-06 再晚些需求：落首页也不算完**，还要走完随后自动弹出的那一轮付费墙
       （购买页 → 优惠券挽留 → 退出回首页）—— 见 state.firstLaunchTail / finishFirstLaunch */
    if(appEntryGuards())return;
    /* 打开 App 的自动付费墙（见 launchPaywall）：引导走完、真要落首页时才排那次弹出（1 秒后从底部滑入）。
       **先排再谈首启收尾**：排上了就挂起「首启尾巴」，下面那句 clearFirstLaunch 会被挡下 */
    launchPaywall();
    /* 检查链三环全过、真落首页了 —— 没排自动付费墙时才真的把「首启引导」关掉 */
    clearFirstLaunch();
    render();
  }
  function cancelAI(silent=false) {
    state.generation++;stopStream();state.activeRequest?.abort();state.activeRequest=null;state.pending=false;
    closeChatPanel();
    if(!silent) {render();}
  }
  /* 仿真请求的固定延迟：常规 850ms、超时场景 1800ms（原可调的「请求延迟」滑块已随请求记录一起删除）。
     开头的 render() 保留 —— 左滑删除的行收起动画靠这次整页重建挂上 .removing（见 deletePartner）。 */
  const SIM_LATENCY_MS = 850, SIM_TIMEOUT_MS = 1800;
  async function api(path,body={},options={}) {
    const id=++state.requestSeq;
    const resultMode = state.outcome;
    const network = state.permissions.network;
    render();
    return new Promise((resolve,reject)=>{
      let finished=false;
      const finish=(error,result)=>{
        if(finished)return;finished=true;clearTimeout(timer);
        options.signal?.removeEventListener('abort',abort);
        render();error?reject(error):resolve(result);
      };
      const abort=()=>finish(Object.assign(new Error('请求已取消'),{code:499}));
      const timer=setTimeout(()=>{
        if(!network)return finish(Object.assign(new Error('网络不可用，请检查模拟设备权限'),{code:0}));
        if(resultMode==='timeout')return finish(Object.assign(new Error('请求超时，积分未扣除'),{code:408}));
        if(resultMode==='error')return finish(Object.assign(new Error('仿真服务暂时不可用，请稍后重试'),{code:503}));
        if(path.includes('/ai/')&&(resultMode==='blocked'||/制造炸弹|色情视频|赌博网站|购买毒品/.test(body.text||'')))
          return finish(Object.assign(new Error('您输入的内容涉及暴恐、色情、违禁品、赌博、涉政、脏话等，拒绝回复！'),{code:400}));
        const result=options.response||{ok:true,requestId:`mock-${id}`,simulated:true};
        finish(null,result);
      },resultMode==='timeout'?SIM_TIMEOUT_MS:SIM_LATENCY_MS);
      if(options.signal?.aborted)abort();else options.signal?.addEventListener('abort',abort,{once:true});
    });
  }
  /* 主 App 的登录门槛：未登录就进**「手机号登录」独立页面**（kb-login 组件整页，appScreen='login'）——
     2026-09-29 按需求由覆盖层改回页面：X / Esc 关掉回来路页（appLoginReturn），
     登录成功（一键 / 短信用同一套链路）收尾后也回来路页，用户接着操作即可。 */
  function needLogin() {return checkKbLogin();}
  /* 聊天分析的仿真结果：三条思路（策略 + 可直接发送的回复），文案按设计图 1:1 给出，
     并保留思路 3 —— 内容够多，用来验证面板滚动与打字机的逐张输出。 */
  function makeIdeas() {
    return [
      {title:'[思路1] 体面收尾：主动切断尴尬局面，建立强者姿态。',reply:'忙你的吧。'},
      {title:'[思路2] 幽默调侃：用自恋合理化对方的沉默。',reply:'看来是被美貌震撼到了，没关系。'},
      {title:'[思路3] 留白收场：不解释、不追问，把开口的主动权留给对方。',reply:'先这样，我去做点别的，想聊了叫我。'}
    ];
  }
  /* 极简 markdown 渲染（原型够用为止），语音追问（AI 通用回复）形态的 AI 回复与回复思路走它
     （见 kb-chat-analysis 组件里 merged 的说明）；有建议卡时那两块仍是纯文本 pre-wrap。支持：
       `#`~`####` 标题行        渲染成 h4
       `1. ` / `1、` 有序列表   项下的**缩进续行**（行首 ≥2 空格）排在该项名下（.ca-md-sub）
       `- ` / `* ` 无序列表     同样支持缩进续行
       `> ` 引用块              连续行合成一个 blockquote（左侧竖线，逐行一段）
       `---` 分隔线             渲染成 hr
       `**加粗**` 与 emoji      行内替换 / 原样保留
     连续的普通行按 markdown 软换行合成一段（行间 <br>）；空行分段。
     tail 是打字机的光标 HTML：塞进最后一个有内容的块末尾，输出时光标紧跟着正在吐的那几个字。 */
  function mdHtml(text, tail='') {
    const inline = t => esc(t).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
    const blocks = [];
    let list = null;   /* 正在收集的列表 {tag:'ol'|'ul', items:[{head,body}]}：空行不打断，直到遇到新块 */
    String(text||'').split('\n').forEach(raw => {
      const line = raw.trim();
      const indent = raw.match(/^\s*/)[0].length;
      if(!line)return;   /* 空行只分段，不打断列表 —— 设计稿里列表项与项之间就是空行 */
      if(/^(---+|\*\*\*+|___+)$/.test(line)){ list=null; blocks.push({tag:'hr'}); return; }
      const h = line.match(/^(#{1,4})\s+(.*)$/);
      if(h){ list=null; blocks.push({tag:'h4',html:inline(h[2])}); return; }
      const q = line.match(/^>\s?(.*)$/);
      if(q){
        const last = blocks[blocks.length-1];
        if(last && last.tag==='blockquote')last.lines.push(inline(q[1]));
        else blocks.push({tag:'blockquote',lines:[inline(q[1])]});
        list=null; return;
      }
      const ol = line.match(/^(\d{1,2})[.、)]\s+(.*)$/);
      if(ol){ if(!list || list.tag!=='ol'){ list={tag:'ol',items:[]}; blocks.push(list); } list.items.push({head:inline(ol[2]),body:''}); return; }
      const ul = line.match(/^[-*]\s+(.*)$/);
      if(ul){ if(!list || list.tag!=='ul'){ list={tag:'ul',items:[]}; blocks.push(list); } list.items.push({head:inline(ul[1]),body:''}); return; }
      /* 列表项下的缩进续行（次行缩进排在该项名下）；无缩进的普通行结束列表 */
      if(list && indent >= 2){ const it=list.items[list.items.length-1]; it.body += (it.body?'<br>':'')+inline(line); return; }
      list = null;
      const last = blocks[blocks.length-1];
      if(last && last.tag==='p'){ last.html += '<br>'+inline(line); return; }   /* 软换行并入同一段 */
      blocks.push({tag:'p',html:inline(line)});
    });
    /* 光标要挂在「最后一个非 hr 块」里 —— hr 是空元素，没地方放 */
    const lastIdx = (() => { for(let i=blocks.length-1;i>=0;i--){ if(blocks[i].tag!=='hr')return i; } return -1; })();
    const tailFor = i => i === lastIdx ? tail : '';
    const li = (it, last) => `<li>${it.head}${it.body?`<div class="ca-md-sub">${it.body}</div>`:''}${last?tail:''}</li>`;
    return blocks.map((b,i) => {
      if(b.tag==='hr')return '<hr>';
      if(b.tag==='blockquote')return `<blockquote>${b.lines.map((l,j)=>`<p>${l}${j===b.lines.length-1?tailFor(i):''}</p>`).join('')}</blockquote>`;
      if(b.tag==='ul')return `<ul>${b.items.map((it,j)=>li(it,j===b.items.length-1&&tailFor(i)!=='')).join('')}</ul>`;
      if(b.tag==='ol')return `<ol>${b.items.map((it,j)=>li(it,j===b.items.length-1&&tailFor(i)!=='')).join('')}</ol>`;
      return `<${b.tag}>${b.html}${tailFor(i)}</${b.tag}>`;
    }).join('') + (lastIdx < 0 ? tail : '');   /* 一个字还没吐时也要有地方挂光标 */
  }
  /* 关系简报：结果到手后随打字机最先逐字打出 —— 先「关系阶段 / 聊天氛围」一行（关系阶段取自当前聊天对象，
     未选对象时没有 stage 可继承，取默认档位「熟悉」），再打正文。
     vibe / text 可换（各条链路各有一份），缺省就是截图分析那条链路的原文本；
     语音追问那张卡不给正文（见 REVIEW_BRIEF）—— 没有正文时连标签行也不渲染，卡只用来装下面的 markdown。 */
  function makeBrief(vibe, text) {
    return {
      stage:normalizeStage(person()?.stage),
      vibe:vibe||'冷淡陌生',
      text:text||'对方对你开场白冷淡不回应，心理处于无感或观察阶段。继续追问会暴露需求感，被定义为骚扰。'
    };
  }
  /* —— 键盘底部麦克风的语音指令（仿真里固定「评价一句」那一档，见 VOICE_QUERIES ——
     原「模拟 › 语音指令」下拉 2026-10-06 已删除、UI 不再能切档）——
     面板麦克风松手后，转写文本作为新的输入交给 AI；AI 按它重新生成的结果就是「AI 通用回复」 ——
     简报卡（不写分析正文）+ 卡内 AI 回复 / 回复思路两块 markdown，没有建议回复。
     原「帮我回复 / 请教问题」两档连同它们的结果结构（简报 + 三组建议 / 只有一段长回复）已删除，
     语音追问只剩这一种结果。真实产品里结果长什么样由模型读语义判断，
     原型用「选好这句话」来模拟 —— 它同时决定转写文案与本次结果。 */
  const VOICE_QUERIES = {
    review:{label:'评价一句',text:'刚才我回她一句「在忙吗」，是不是不太好？'}
  };
  /* 语音指令「评价一句」（语音追问的唯一一档）：简报卡（不写分析正文）+ AI 回复（评价）+ 回复思路，没有建议回复。
     answer / thinking 都是 markdown（走 mdHtml()，卡内渲染见 kb-chat-analysis 组件）——
     answer 是「整体评价 + 分析对话节点」（✅⚠️ 两条 + 引用块摆对话），thinking 是「优化建议」
     （1/2/3 三款可直接替换的话，项下缩进续行就是那句话，见设计稿）。 */
  /* 评价形态的「关系简报卡」**不写分析正文** —— 那张紫底卡只用来装 AI 回复 / 回复思路两块 markdown
     （组件里的 merged 判定：有简报卡且没有建议卡），所以给它一个「有卡、无正文」的简报对象：
     text 为空时组件不渲染那段文字，打字机也不给简报排段落。 */
  const REVIEW_BRIEF = { text: '' };
  const REVIEW_ANSWER=[
    '## 整体评价',
    '✅ 前面几句节奏很不错，夸得自然不油腻；',
    '⚠️ 最后一句「那我替你难受3秒」稍微有点平淡，没有接住她那句"不太是 瞎长"的自嘲。',
    '她是在开玩笑吐槽自己身材，你这句只是简单共情，缺少继续拉扯的趣味，容易把话题收住。',
    '',
    '---',
    '',
    '## 分析对话节点',
    '> 你：那挺好呀，肉都长到该长的地方去了',
    '> 她：不太是 瞎长',
    '',
    '她这句话是自嘲式的谦虚，不是真的自卑。你的回复「替你难受3秒」安全，但偏普通，没有把暧昧氛围延续下去。'
  ].join('\n');
  const REVIEW_THINKING=[
    '## 优化建议',
    '1. 轻撩款（推荐）',
    '  哈哈，那得线下鉴定一下才知道是不是瞎长 😉',
    '',
    '2. 轻松幽默款',
    '  哈哈，那估计是肉有自己的想法，不受大脑控制。',
    '',
    '3. 温柔稳妥款',
    '  哪有，161/110 这个比例看着刚刚好。'
  ].join('\n');
  /* 本次 AI 结果的结构（由输入类型 state.draftKind 决定，「有就渲染」见组件 kb-chat-analysis）——
     只有两种输入：chat（截图转写 / 打字：简报 + 三组建议）与 review（语音追问：简报卡 +
     AI 回复 + 回复思路）。原 reply / ask 两种语音结果结构已删除。 */
  function makeOutcome(kind) {
    if(kind==='review')return {brief:REVIEW_BRIEF,ideas:[],answer:REVIEW_ANSWER,thinking:REVIEW_THINKING};
    return {brief:makeBrief(),ideas:makeIdeas(),answer:'',thinking:''};
  }
  /* —— 「AI 分析」过渡动画页（kb-scan）：点「立即分析」与聊天分析面板之间的一段过渡 ——
     顶部居中「正在分析中…」，中央取景框包着文档图标、一条白色横线在图标上上下往返扫描，
     1 秒（SCAN_MS）播完由 finishScan() 原地切到聊天分析面板。
     上传请求在过渡期间照常进行，互不等待；Esc 可跳过过渡直接进面板。 */
  const SCAN_MS = 1000;
  function openScanPanel() {
    stopScan();
    state.scanPanel=true;state.scanStartedAt=performance.now();
    state.pickerEnter=true;render();state.pickerEnter=false;
    state.scanTimer=setTimeout(finishScan,SCAN_MS);
  }
  /* 只清状态与定时器、不重渲染：各处收起面板 / 切模式时由调用方 render */
  function stopScan() { clearTimeout(state.scanTimer); state.scanTimer=null; state.scanPanel=false; state.scanStartedAt=0; }
  /* 过渡播完（1 秒到 / Esc 跳过）：切入聊天分析面板。请求还在跑就进加载态；
   结果已经先回来（延迟调得很低时）也先停一拍加载态，由 beginStreamFromLoading() 接手。
   两条链路都走这里：截图「立即分析」与面板麦克风的语音追问（submitPanelVoice）。 */
  function finishScan() {
    stopScan();
    openChatPanel();
    if(!state.pending&&(state.results.length||state.chatAnswer||state.chatThinking))beginStreamFromLoading();
  }
  /* 从加载态起打字机 —— 加载态（骨架屏）至少停留 CHAT_LOADING_MIN_MS：
     结果比过渡动画先到时不这么做，「聊天分析 · 生成中」会一闪而过（语音追问尤其明显：
     转写先花掉 850ms，等结果到手时过渡刚好播完）。已经在加载态停留够久的立即起。 */
  const CHAT_LOADING_MIN_MS = 520;
  function beginStreamFromLoading() {
    if(!state.chatPanel||state.pending||state.chatPhase!=='loading')return;
    const waited=performance.now()-(state.chatLoadingAt||0);
    if(waited>=CHAT_LOADING_MIN_MS)return startStream();
    setTimeout(()=>{if(state.chatPanel&&!state.pending&&state.chatPhase==='loading')startStream();},CHAT_LOADING_MIN_MS-waited);
  }
  /* —— 「模拟截屏」：仿真按一下系统截屏键 ——
     造一张截图（画法同内置样例，见 core/kit.js 的 shot()）插进相册最前，手机整屏白闪一下；
     截屏事件的两种后果按**键盘此刻是否激活**分叉：
     ① 激活（在屏且可用）—— 键盘能感知到这次截屏：不用点菜单栏的相册图标、也不用选图再点分析，
        直接把这张截图交给 AI 分析链路（analyzePhotos），进「AI 分析」过渡动画页，之后照常；
     ② 未激活（键盘收起 / 未开启 / 被完全访问 · 登录层盖着 / 主 App 形态）—— 键盘感知不到：
        截图先躺在相册里（打开选择器就能选到它），id 记进 state.pendingShot；
        等键盘被唤起、且三关（完全访问权限 → 登录状态 → 完整的相册访问权限）都通过后，
        菜单栏的相册图标才换成它的缩略图并持续放大缩小，引导用户点击（见 pendingShotItem）。 */
  /* 键盘「激活」的判定：在屏（键盘形态、未收起、键盘已开启）且没有被覆盖层挡住
     （完全访问引导层 / 键盘内登录层盖着时键盘拿不到相册，也就不算能感知截屏） */
  function keyboardActive() {
    return state.appView==='keyboard' && !state.kbCollapsed && state.permissions.kbEnabled && !state.kbFullAccess && !state.kbLogin;
  }
  /* 造一张「刚刚的截图」：内容取宿主会话最近三条消息（画成深色聊天截图），时间标「刚刚」，
     插到相册最前 —— 打开选择器第一眼就是它。相册就是 samples（photoItems()），只在页面内存里。
     id 用自增序号拼（同一毫秒连点两下也不会撞，Date.now() 会）。 */
  let shotSeq=0;
  function makeScreenshot() {
    const texts=state.messages.slice(-3).map(m=>m.text).filter(Boolean);
    const item={id:`shot${++shotSeq}`,name:'刚刚的截图',time:'刚刚',messages:texts.length?texts:['（暂无消息）']};
    samples.unshift(item);
    return item;
  }
  /* 待分析截图的缩略图在菜单栏露脸的条件 —— 三关都过才显示：
     键盘在屏（未收起、未关闭）→ 完全访问权限（Android 默认开启）→ 已登录 → 相册是「完整访问」。
     任一关没过就仍是普通相册图标（点了照旧走选择器 / 对应的权限引导形态）；
     等条件补齐（唤起键盘做完前置检查、或把相册权限置成完整访问）后同一张图自动露脸 ——
     pendingShot 一直留着，直到点掉它（进入 AI 分析）、再截一张，或从页面列表跳转（「重置会话」
     入口 2026-10-03 已删，刷新页面即清）。 */
  function pendingShotItem() {
    if(!state.pendingShot||state.kbCollapsed||!state.permissions.kbEnabled)return null;
    if(needsFullAccess()||!state.loggedIn||state.permissions.photos!=='full')return null;
    return samples.find(s=>s.id===state.pendingShot)||null;
  }
  /* 菜单栏那枚缩略图的**方形真位图**（见 core/kit.js 的 shotThumb：canvas 画好导出 data URL）：
     同一张截图只画一次 —— 打字机 / 权限开关等引起的重渲染不再重画 canvas。 */
  const shotThumbCache = new Map();
  function shotThumbImage(item) {
    if(!item)return '';
    if(!shotThumbCache.has(item.id))shotThumbCache.set(item.id,shotThumb(item));
    return shotThumbCache.get(item.id);
  }
  function takeScreenshot() {
    const item=makeScreenshot();
    /* 手机整屏白闪一下（真机截屏的即时反馈，约 0.35s）：闪完由定时器摘掉标记重渲染；
       连着点即重新计时、再闪一次 */
    state.shotFlash=performance.now();
    clearTimeout(state.shotFlashTimer);
    state.shotFlashTimer=setTimeout(()=>{state.shotFlashTimer=null;state.shotFlash=0;render();},350);
    /* 仿真控制台弹层开着时先收起（只有键盘形态会开它 —— 弹层入口在键盘形态窄屏工具条的
       「仿真设置」按钮上；主 App 形态的右栏 APP STATE 与仿真控制台入口 2026-09-29 已删除）：
       截屏的后果都发生在手机里，别被弹层挡着。主 App 形态的 state.modal 是页面级子页，
       不动它 —— 截图照常落进相册，回到键盘形态时提示位会按三关判定露脸 */
    if(state.modal&&state.appView==='keyboard'){state.modal=null;state.modalData={};}
    if(keyboardActive()){state.pendingShot='';return analyzePhotos([item]);}
    state.pendingShot=item.id;
    return render();
  }
  /* —— 聊天分析面板（kb-chat-analysis）：开关与生命周期 ——
     generate() 一进场就打开面板（loading：四张骨架占位卡），请求结束后进入打字机；
     简报 / AI 回复 / 回复思路 / 建议卡四块都是「有就渲染」（两种结果见 makeOutcome），
     右上 X / Esc 关闭即取消（生成中），完成后关闭则收起并清掉结果。 */
  /* 页面列表里的静态形态：把某一种输入的结果摆好、面板停在 done 态（不做打字机）。
     kind：chat（截图 / 打字，三组建议）与语音追问的 review ——
     后者顺带补上那一档的转写，底部「重新生成」在真实链路里复用同一份输入。 */
  function chatStatic(kind) {
    const outcome=makeOutcome(kind);
    state.chatPanel=true;state.chatPhase='done';state.caPicked=-1;
    state.chatBrief=outcome.brief;state.pendingBrief=outcome.brief;
    state.results=outcome.ideas;state.chatAnswer=outcome.answer||'';state.chatThinking=outcome.thinking||'';
    state.draftKind=kind;
    state.draft=kind==='chat'?'今天有点累，感觉什么都没做好。':(VOICE_QUERIES[kind]?.text||'');
    return render();
  }
  function openChatPanel() {
    stopStream();
    /* 本次的简报在请求发起时定好（纯问答形态没有简报，见 makeOutcome） */
    state.chatBrief=state.pendingBrief;
    state.chatPhase='loading';state.caPicked=-1;state.chatLoadingAt=performance.now();
    /* 已经开着（重新生成 / 上传完成后的第二次调用）只把内容重置回加载态 */
    if(state.chatPanel)return render();
    state.chatPanel=true;
    state.pickerEnter=true;render();state.pickerEnter=false;
  }
  /* 只清状态、不重渲染：切平台 / 切模式 / 回主 App / 打开其它覆盖层时各自会 render */
  function closeChatPanel() {
    stopScan();
    stopStream();
    /* 结果与本次输入（截图转写 / 语音指令草稿）都只在面板生命周期里存在：
       任何路径关掉面板都一并清掉 —— 关闭后回到干净的键盘页（菜单栏 + 键区，正常高度）。
       错误面板要复用输入重试，由 generate() 的 catch 在调用前后自行保留。 */
    state.chatPanel=false;state.chatPhase='loading';state.chatBrief=null;state.caPicked=-1;
    state.results=[];state.draft='';state.draftKind='chat';
    state.chatAnswer='';state.chatThinking='';state.pendingBrief=null;
  }
  /* 「语音输入的去向」判定（见 onVoiceUp）：面板开着**且已输出完毕** —— 即屏幕上停的是
     「聊天分析 · 已完成」或「AI通用回复」这两个页面 —— 此时任何语音入口松手都当语音追问
     （转写交 AI 重新生成，最终落到 AI通用回复）；生成中 / 加载态不算（内容还没定型，
     语音圆钮仍照常把转写写进宿主输入框）。 */
  function chatPanelDone() { return !!state.chatPanel && state.chatPhase==='done'; }
  /* 面板开着时要去打开其它整页覆盖层 / 离开键盘：生成还在跑就一并取消 */
  function dismissChatPanel() { if(state.pending)cancelAI(true); else closeChatPanel(); }
  /* 右上 X / Esc：生成中 = 取消本次生成（有提示）；已完成 = 直接收起并清掉结果 */
  function closeChatAnalysis() {
    if(state.pending)return cancelAI();
    closeChatPanel();render();
  }
  async function generate() {
    if(state.pending)return;
    if(needLogin())return;
    /* 左栏「设备权限」的「键盘完全访问」开关控制：关闭时静默不执行
       （真机上没有完全访问权限的键盘拿不到网络，生成自然走不通；Android 默认开启该权限） */
    if(!state.permissions.keyboard)return;
    if(!state.draft.trim()){return;}
    /* 积分不足的付费引导**只由左栏「模拟试用额度耗尽」开关触发**（state.creditsOut）：
       开关关着时 App 永远有额度，正常生成不会被拦（额度也不会被自然消耗光，见下面的扣减）。 */
    /* 额度不足被拦（2026-09-28 起分两路）：主 App 形态落到会员购买页（**2026-10-06 起就是
       「会员购买页 · 新」** purchase2-copy / appPurchasePlusCopyPage —— 第一个购买页 purchase
       同日已按需求整页删除，勿再补回）；键盘形态仍弹键盘内的付费引导层（kb-paywall） */
    if(state.creditsOut&&!state.member&&state.credits<1){
      if(state.appView==='app')return openAppScreen('purchase2-copy');
      return openPaywall();
    }
    state.results=[];state.pending=true;state.modal=null;state.caPicked=-1;
    state.chatAnswer='';state.chatThinking='';   /* 新请求：上一轮的 AI 回复与回复思路一并清掉 */
    /* 本次结果的结构按输入来：截图转写 / 打字恒为三组建议，语音追问恒为「AI 通用回复」
       （见 makeOutcome）—— 简报也在这里定好，随面板打开先渲染 */
    const outcome=makeOutcome(state.draftKind);
    state.pendingBrief=outcome.brief;
    /* 键盘模式下先打开聊天分析面板（loading：骨架占位；主 App 形态没有键盘区域，不展示）。
       「AI 分析」过渡动画页还开着时不开：面板与打字机都由过渡定时器（finishScan）接手。 */
    if(state.appView==='keyboard'&&!state.scanPanel)openChatPanel();
    const run=++state.generation,epoch=state.accountEpoch;
    const controller=new AbortController();state.activeRequest=controller;
    const body={mode:'keyboard',text:state.draft,partnerId:person()?.id||null,platform:state.platform};
    try {
      await api('/v1/ai/generate',body,{signal:controller.signal,response:{callId:`mock-call-${Date.now()}`,replies:outcome.ideas,answer:outcome.answer||'',thinking:outcome.thinking||'',aiGenerated:true,simulated:true}});
      if(run!==state.generation||epoch!==state.accountEpoch)return;
      await new Promise(r=>setTimeout(r,260));
      if(run!==state.generation||epoch!==state.accountEpoch)return;
      state.results=outcome.ideas;state.chatAnswer=outcome.answer||'';state.chatThinking=outcome.thinking||'';
      state.pending=false;state.activeRequest=null;state.calls++;
      /* 非会员每次生成扣 1 点，但**扣到 1 就停**：额度自然用不完 —— 归零只有「模拟试用额度耗尽」开关一条路，
         否则开关关着也会因为攒够 28 次生成而突然弹付费引导（开关与积分对不上）。 */
      if(!state.member&&state.credits>1)state.credits--;
      persist();
      /* 不直接铺结果：面板里起打字机，按段落逐字输出（输出完才浮出底部按钮）。
         「AI 分析」过渡动画页还开着时先不起：等过渡播完由 finishScan() 接手；
         走 beginStreamFromLoading() 而不是直接 startStream()：让加载态至少停留一小段。 */
      if(state.scanPanel){/* 过渡未完，交给 finishScan() */}
      else if(state.chatPanel)beginStreamFromLoading();else render();
    } catch(e) {
      if(run!==state.generation)return;
      state.pending=false;state.activeRequest=null;
      /* 安全拦截（400：左栏「模拟安全拦截」开关，或输入本身命中敏感词）：面板不收起，
         原地换成拦截态 —— 居中提示「检测到敏感词，AI拒绝回答」（kb-chat-analysis 的 blocked 态），
         X / Esc 关闭才回干净键盘页；「AI 分析」过渡页还播着就直接切过来，不等它播完。
         积分不扣（扣减只在成功分支），本次输入保留在 draft 里、面板关闭时一并清掉 */
      if(e.code===400&&state.appView==='keyboard'){
        stopScan();
        state.chatPhase='blocked';
        if(!state.chatPanel){state.chatPanel=true;state.pickerEnter=true;}
        renderFresh();state.pickerEnter=false;
        return;
      }
      /* 失败关面板：closeChatPanel 会清掉本次输入，先留住一份再关 ——
         退出后输入框里仍是这次的内容，改完可直接重新发起；
         错误卡与轻提示都已删除，失败即静默回到干净键盘页 */
      const input={draft:state.draft};
      closeChatPanel();
      state.draft=input.draft;
      render();
    }
  }
  /* —— 键区打字的目标 ——
     默认落在宿主会话输入框（state.host / state.hostCaret）；
     对象编辑面板（kbEditor）打开时改落在面板里的「备注名」输入框：字直接写进正在编辑的表单
     （state.modalData.name），组件按 partnerNameDisplay() 渲染成 input 的 value，
     并顺手调度一次静默保存 —— 打开面板不用先点输入框，直接打字就是改备注名；
     问AI 页（freeChat）打开时改落在页面里的提问输入框（state.freeText / state.freeCaret），
     组件按 freeChatDisplay() 渲染成 textarea 的 value —— 这一页打开就直接打字问 AI。 */
  const PARTNER_NAME_MAX = 20;   /* 与组件里 input 的 maxlength 保持一致 */
  const FREE_TEXT_MAX = 1500;    /* 与组件里 textarea 的 maxlength 保持一致 */
  function typingInPartner() { return Boolean(state.kbEditor); }
  function typingInFree() { return Boolean(state.freeChat); }
  /* 键区右下角那颗蓝键（Enter）的标签：它是系统功能键，值固定、语义随输入目标变 ——
     宿主聊天输入框与问AI 页的提问输入框都是「发送」（前者发消息，见 sendHost；
     后者把这句话交给 AI，见 sendFreeChat），
     编辑 / 新增聊天对象的备注名（单行）是「确定」（点了落库并回聊天对象管理页，见 closeKbEditor）。 */
  function enterKeyLabel() { return typingInPartner() ? '确定' : '发送'; }
  /* 备注名的已确认文字：优先面板草稿；编辑态还没改过时兜底成对象当前的名字 */
  function partnerBaseName() {
    const p = state.partners.find(item => item.id === state.modalData.id);
    return state.modalData.name ?? p?.name ?? '';
  }
  function targetValue() { return typingInFree() ? state.freeText : typingInPartner() ? partnerBaseName() : state.host; }
  /* 光标锚点：问AI 页贴 freeCaret、编辑器场景贴 partnerCaret（都没设过就贴末尾），宿主场景用 hostCaret */
  function targetCaret() {
    const text = targetValue();
    const caret = typingInFree() ? (state.freeCaret ?? text.length) : typingInPartner() ? (state.partnerCaret ?? text.length) : state.hostCaret;
    return Math.max(0, Math.min(caret, text.length));
  }
  function setTargetValue(text, caret) {
    if (typingInFree()) {
      state.freeText = text.slice(0, FREE_TEXT_MAX);
      state.freeCaret = Math.max(0, Math.min(caret, state.freeText.length));
      return;
    }
    if (typingInPartner()) {
      state.modalData.name = text.slice(0, PARTNER_NAME_MAX);
      state.partnerCaret = Math.max(0, Math.min(caret, state.modalData.name.length));
      scheduleKbPartnerSave();
      return;
    }
    state.host = text.slice(0, 1200);
    state.hostCaret = Math.max(0, Math.min(caret, state.host.length));
  }
  /* 备注名输入框的显示值（组件按它渲染 input 的 value）：已确认文字 + 未确认的组合串，
     组合串落在光标锚点处 —— 与宿主输入框的 displayText() 是同一套思路 */
  function partnerNameDisplay() {
    const name = partnerBaseName();
    if (!state.composition || !typingInPartner()) return name;
    const pos = Math.max(0, Math.min(state.partnerCaret ?? name.length, name.length));
    return name.slice(0, pos) + activeComposition() + name.slice(pos);
  }
  /* 问AI 页提问输入框的显示值（组件按它渲染 textarea 的 value）：已确认文字 + 未确认的组合串，
     组合串落在光标锚点处 —— 与上面两个输入框同一套思路 */
  function freeChatDisplay() {
    const text = state.freeText;
    if (!state.composition || !typingInFree()) return text;
    const pos = Math.max(0, Math.min(state.freeCaret ?? text.length, text.length));
    return text.slice(0, pos) + activeComposition() + text.slice(pos);
  }
  function insert(text) {
    const cur = targetValue();
    const pos = targetCaret();
    setTargetValue(cur.slice(0, pos) + text + cur.slice(pos), pos + text.length);
    render();
  }
  function commitComposition(value) {insert(value??ime.candidates(activeComposition())[0]??activeComposition());state.composition='';state.t9Path=0;render();}
  /* 联想上下文：**当前输入目标**里光标前的已确认文字（不含未确认的组合串）——
     宿主输入框 / 问AI 页的提问输入框 / 编辑面板的备注名各取各的，
     联想词由 core/ime.js 的 suggestions() 按它的尾词计算（只看最后几个字，取多了不影响结果）：
     候选词栏组件（kb-candidates，与点选动作）都取这一份，两边算出的候选词因此始终一致 */
  function targetContext() { return targetValue().slice(0, targetCaret()); }
  function contextTail() { return targetContext().slice(-4); }
  /* 组合串非空 = 组合候选；为空 = 联想态，按上下文取词（与候选词栏的展示一致） */
  function currentCandidates() {
    const comp=activeComposition();
    return comp?ime.candidates(comp):ime.candidates('',contextTail());
  }
  /* 按键输入。点任意输入键即进入打字态（顶部栏第二状态）；
     中文层的字母先进组合串（state.composition），显示在宿主聊天输入框的光标处（见 displayText），
     点候选词 / 空格 / 回车后由候选词替换那句字母；
     把输入全部删光后自动回到菜单栏（顶部栏第一状态）。 */
  function keypress(value) {
    if(value==='Backspace'){
      if(state.composition){state.composition=state.composition.slice(0,-1);state.t9Path=0;}
      else {const pos=targetCaret(),text=targetValue();if(pos>0)setTargetValue(text.slice(0,pos-1)+text.slice(pos),pos-1);}
      if(state.typing&&!state.composition&&!targetValue().length)state.typing=false;
    } else if(value==='Shift')state.shift=!state.shift;
    /* 中/英切换只改 language：键区布局由 ime.layout() 派生 —— 英文恒 26 键，
       切回中文自动回到 state.layout 记着的那种中文布局；数字层固定九宫格，与语言无关。
       英文键盘是独立键盘、没有联想词：切到英文即退出打字态（顶部栏回菜单栏）。 */
    else if(value==='language'){state.language=state.language==='zh'?'en':'zh';state.composition='';state.t9Path=0;state.typing=false;}
    else if(['symbols','numbers','letters'].includes(value)){state.layer=value;state.composition='';state.t9Path=0;}
    else if(value==='Space'){if(state.composition)commitComposition();else insert(' ');}
    /* 九宫格右列的「换行」：直接插入一个换行符，不提交、也不进入打字态（与 Enter 一致）；
       备注名是单行输入框，编辑器场景下这颗键不做事 */
    else if(value==='Newline'){if(!typingInPartner())insert('\n');}
    else if(value==='Enter'){
      /* 组合串非空先上屏（与宿主会话里「发送」的处理一致，不丢未确认的拼音），这一步不换场景 */
      if(state.composition)commitComposition();
      /* 功能键的语义随输入目标变（标签见 enterKeyLabel）：
         宿主会话「发送」→ 发消息；问AI 页「发送」→ 把这句提问（连同已选截图）交给 AI（sendFreeChat）；
         对象编辑「确定」→ 落库并回聊天对象管理页 */
      else if(typingInFree())sendFreeChat();
      else if(typingInPartner())closeKbEditor();
      else sendHost();
    } else if(state.language==='zh'&&state.layer==='letters'&&(/^[a-z]$/i.test(value)||(ime.layout(state)==='t9'&&/^[2-9]$/.test(value)))){state.composition=(state.composition+value).slice(0,24);state.t9Path=0;}
    /* 九宫格打字中的「分词 '」键：在拼音后加分隔符（如 n'i），只在组合串非空且末位是数字时可用 */
    else if(value==='seg'){if(state.composition&&/[2-9]$/.test(state.composition))state.composition+="'";}
    else insert(state.shift?value.toUpperCase():value);
    /* 数字层 / 符号层 / 英文键盘都只是直接插入字符，不进打字态 —— 顶部栏保持菜单栏，不出候选词栏
       （联想词只属于中文键盘：26 键拼音与九宫格） */
    if(!['Backspace','Shift','language','letters','numbers','symbols','Enter','Newline'].includes(value)&&state.language==='zh'&&state.layer!=='numbers'&&state.layer!=='symbols')state.typing=true;
    render();
  }
  /* 新消息的入场动画只播一次：推送时带上 fresh 标记，等本次动作的同步渲染都完成后再清掉。
     整页重渲染会重建全部 DOM，标记不清的话，之后任何一次交互（如选择器里选图）
     都会让整个聊天页的消息重放入场动画（看起来整页弹一下）。 */
  function clearFreshMessages() { state.messages.forEach(m => { delete m.fresh; }); }
  function sendHost() {
    if(!state.host.trim()){return;}
    state.messages.push({mine:true,text:state.host,time:wxStamp(),fresh:true});state.host='';state.hostCaret=0;state.typing=false;render();$('#chat').scrollTop=$('#chat').scrollHeight;
    clearFreshMessages();
  }
  /* 按住说话（替代已删除的「主 App 接力 · 语音」弹层）：按住麦克风即开始「录音」——
     浮出一块**与键盘区域同高**的**蓝色**毛玻璃遮罩（贴底、自下而上渐隐，键盘被面板 / 选择器
     撑到三分之二时整块面板都在遮罩里，见 theme.css 的 .phone:has(.keyboard…) 三条换算），
     松手后的去向按「说话时屏幕上停的是哪一页」分两种：
     **面板停在已完成态**（「聊天分析 · 已完成」/「AI通用回复」两个页面）—— 所有语音入口
     都与面板麦克风同一条链路：转写当给 AI 的指令，过渡页 → 生成中 → AI通用回复（submitPanelVoice）；
     其余时候（干净键盘页 / 面板生成中）仍是仿真转写写入宿主聊天输入框。
     按住期间上滑超过阈值进入取消态（遮罩与波浪变红、提示换「松手取消」），此时松手即取消、不写转写。
     move / up / cancel 监听挂在 window 上：按下后 render() 重建 DOM 也不丢事件链。 */
  const VOICE_TEXT = '今天辛苦啦，要不要一起出去走走？不想说话也没关系，我陪你。';
  const VOICE_CANCEL_PX = 56;
  function dropVoiceHoldListeners() {
    window.removeEventListener('pointermove',onVoiceMove);
    window.removeEventListener('pointerup',onVoiceUp);
    window.removeEventListener('pointercancel',onVoiceAbort);
  }
  function beginVoiceHold(e, source) {
    if(state.voiceHold)return;
    /* 麦克风权限无 UI 入口（手改 state.permissions.microphone 验证），拦截时静默不执行 */
    if(!state.permissions.microphone)return;
    state.voiceHold={cancel:false,y0:e.clientY,pid:e.pointerId,source:source||'composer'};
    render();
    window.addEventListener('pointermove',onVoiceMove);
    window.addEventListener('pointerup',onVoiceUp);
    window.addEventListener('pointercancel',onVoiceAbort);
  }
  function onVoiceMove(e) {
    const hold=state.voiceHold;if(!hold||e.pointerId!==hold.pid)return;
    const cancel=e.clientY-hold.y0<-VOICE_CANCEL_PX;
    if(cancel===hold.cancel)return;
    hold.cancel=cancel;
    $('.voice-rec')?.classList.toggle('cancel',cancel); /* 就地切态：不整页重渲染，波浪动画不重置 */
  }
  function onVoiceUp(e) {
    const hold=state.voiceHold;if(!hold||e.pointerId!==hold.pid)return;
    state.voiceHold=null;dropVoiceHoldListeners();render();
    if(hold.cancel)return; /* 上滑取消：直接收场 */
    /* 问AI 页按住提问输入框说的这句（source='free'）：转写并入提问框，连同已选截图直接发送 */
    if(hold.source==='free')return submitFreeVoice();
    /* 面板麦克风，或面板正停在已完成态时按下的任何语音入口（见 chatPanelDone）：
       这句话是给 AI 的新指令，转写后重新生成（过渡页 → 生成中 → AI通用回复，见 submitPanelVoice） */
    if(hold.source==='panel'||chatPanelDone())return submitPanelVoice();
    /* 其余语音入口（输入栏语音圆钮 / 框内麦克风、iOS 底栏）：仿真转写（预置文案）写进宿主聊天输入框。
       写完补一次渲染：转写文字要立刻显示在输入框里，聊天分析面板底部的「发送」也要按它亮起
       （面板与输入框可能同时在屏上 —— 这条路径正是「输入框拿到数据 → 发送可点」的来源之一） */
    runMutation('/mock/speech/recognize',{source:'preset',platform:state.platform},()=>{
      state.host=(state.host+VOICE_TEXT).slice(0,1200);state.hostCaret=state.host.length;
      render();
    },{response:{text:VOICE_TEXT,simulated:true}});
  }
  /* —— 语音追问：面板麦克风，或面板停在已完成态时的任何语音入口 ——
     按住说出的这句话是给 AI 的指令（仿真固定「评价一句」那一档，见 VOICE_QUERIES）：
     松手转写后先把上一轮结果收掉、进「AI 分析过渡页」（kb-scan），请求在过渡期间发出，
     过渡播完由 finishScan() 进面板 loading —— 之后照常由打字机把本次结果逐段打出来。
     转写文本作为本次输入（state.draft），结果结构由 draftKind 决定（→ makeOutcome，只有一种）。 */
  function submitPanelVoice() {
    const kind=state.voiceQuery, query=VOICE_QUERIES[kind]||VOICE_QUERIES.review;
    runMutation('/mock/speech/recognize',{source:'preset',platform:state.platform},()=>{
      if(state.pending)cancelAI(true);
      closeChatPanel();                 /* 上一轮的结果与输入一并清掉（draftKind 也复位） */
      state.draft=query.text;           /* 这句话就是本次 AI 的输入 */
      state.draftKind=kind;
      openScanPanel();                  /* 先「AI 分析过渡页」，播完再进面板生成中 */
      setTimeout(()=>generate(),0);
    },{response:{text:query.text,simulated:true}});
  }
  /* —— 问AI 页「按住提问输入框说话」——
     **只在图片选择器展开时挂这条入口**（见 bind 里 #free-chat 的 pointerdown）：
     那时框下方是截图网格、框里没有光标，按住框就是「要说话」；键区在下面时框里停着键盘的光标，
     长按框留给编辑 / 选字，语音走输入行右端那颗语音按钮（data-voice-hold="free"，按下即进按住态）。
     短按不算（那是聚焦 + 放光标，点框还会收起图片选择器）：按下后等 FREE_HOLD_MS，手指仍在框上
     （没松手、也没明显移动）才转成「按住说话」—— 之后与其它语音入口同一套：一块与键盘区域同高的
     遮罩盖住整块键盘（含输入行与下方键区 / 图片选择器网格），上滑超阈值变红取消，
     松手（未上滑）由 onVoiceUp 的 source='free' 接手。
     提前松手 / 滑走只摘掉计时器，不进按住态（那次点按仍是普通的点按）。 */
  function startFreeVoiceWatch(e) {
    if(state.voiceHold||state.freeHoldTimer)return;
    const pid=e.pointerId,y0=e.clientY;
    const drop=()=>{
      clearTimeout(state.freeHoldTimer);state.freeHoldTimer=null;
      window.removeEventListener('pointerup',drop);
      window.removeEventListener('pointercancel',drop);
      window.removeEventListener('pointermove',moved);
    };
    const moved=ev=>{if(ev.pointerId!==pid||Math.abs(ev.clientY-y0)>10)drop();};
    state.freeHoldTimer=setTimeout(()=>{state.freeHoldTimer=null;drop();beginVoiceHold({clientY:y0,pointerId:pid},'free');},FREE_HOLD_MS);
    window.addEventListener('pointerup',drop);
    window.addEventListener('pointercancel',drop);
    window.addEventListener('pointermove',moved);
  }
  /* 问AI 页松手后的落点：与其它语音入口同一套仿真转写（/mock/speech/recognize，文案 VOICE_TEXT），
     不同的是这句转写**并入提问框**（与已输入的文字拼在一起），然后立刻走 sendFreeChat ——
     发送内容 = 这句话（文字 + 转写）+ 已选截图；这一路不经过快捷栏，结果结构走默认的
     AI通用回复（见 sendFreeChat 的 kind）。
     上滑取消在 onVoiceUp 里就返回了，走不到这里。 */
  function submitFreeVoice() {
    runMutation('/mock/speech/recognize',{source:'preset',platform:state.platform},()=>{
      const typed=state.freeText.trim();
      state.freeText=((typed?typed+' ':'')+VOICE_TEXT).slice(0,FREE_TEXT_MAX);
      state.freeCaret=state.freeText.length;
      /* 发送要等这次转写请求先收尾：runMutation 的 busy 标记在回调返回后才落下，
         而带截图的那条发送链路自己也要发一次上传仿真（见 sendFreeChat）——
         同一个 tick 里接着发会被 busy 拦掉。放到下一轮再走，转写文字已经进 freeText 了 */
      setTimeout(()=>sendFreeChat(),0);
    },{response:{text:VOICE_TEXT,simulated:true}});
  }
  function onVoiceAbort(e) {
    const hold=state.voiceHold;if(!hold||e.pointerId!==hold.pid)return;
    state.voiceHold=null;dropVoiceHoldListeners();render();
  }
  /* 清场兜底：打开弹层 / 切形态时若还挂在按住态（理论上手指占用中不会发生），把监听摘干净 */
  function abortVoiceHold() {
    if(!state.voiceHold)return;
    state.voiceHold=null;dropVoiceHoldListeners();
  }
  /* 按住说话遮罩：**高度 = 当前键盘区域的高度**（与 .keyboard 同高、同贴底，三条换算见
     theme.css 的 .phone:has(.keyboard…) 规则）—— 干净键盘页正好罩住键盘，聊天分析面板 /
     选择器把键盘撑到三分之二时罩住整块面板，问AI 页跟着输入区一起长高。
     遮罩层 .voice-rec-scrim 自带「底部 1 → 顶部 0」的渐隐（见 theme.css），
     上缘与面板内容自然融合；底纹按住态是蓝色、取消态泛红，
     提示词与波浪条的颜色 / 文案由 .cancel 切换。
     波浪条 45 根、中间高两边低 + 伪随机起伏 —— 形状由 i 的 sin 哈希决定（每次渲染一致），
     几何全用百分比（宽 66% 屏宽、条高 --hp 相对波形容器），device 视图放大布局下比例不变；
     动画周期（--t）与错峰延迟（--dl）各自不同，看起来像真实波形在跳。 */
  function voiceHoldOverlay() {
    if(!state.voiceHold)return '';
    const bars=Array.from({length:45},(_,i)=>{
      const r=Math.abs(Math.sin(i*12.9898+4.1)*43758.5453%1);
      const env=1-Math.pow(Math.abs(i-22)/22,1.6);
      const hp=(20+60*env*(.4+.6*r)).toFixed(1);
      return `<i style="--hp:${hp}%;--t:${(.45+r*.55).toFixed(2)}s;--dl:${(-r*1.1).toFixed(2)}s"></i>`;
    }).join('');
    return `<div class="voice-rec${state.voiceHold.cancel?' cancel':''}" role="status" aria-label="按住说话"><div class="voice-rec-scrim" aria-hidden="true"></div><p class="voice-rec-tip"><span class="tip-send">松手发送，上滑取消</span><span class="tip-cancel">松手取消</span></p><div class="voice-rec-wave" aria-hidden="true">${bars}</div></div>`;
  }
  async function runMutation(path,body,success,options={}) {
    if(state.mutationBusy)return;
    state.mutationBusy=true;
    const epoch=state.accountEpoch;
    try {const result=await api(path,body,options);if(epoch!==state.accountEpoch)return;success(result);}
    catch(e){options.onError?.();}
    finally{state.mutationBusy=false;}
  }
  /* 删除聊天对象是真删除：仍先发 DELETE 仿真请求（保持本地仿真链路），成功后把对象从
     state.partners 里移除并 persist 落库 —— 列表直接读 partners，退出列表再进来 / 刷新页面
     都不会再出现。删掉的若是当前选中对象，回到「不选择」并清掉键盘侧的生成结果
     （结果属于该对象的上下文）；宿主输入框草稿不动。
     删除只有一条入口：列表左滑露出的删除按钮直接走这里，不弹二次确认（编辑器里的
     「删除这个对象」已按需求删除）。删除成功不弹提示 —— 行收起 + 列表少一条本身就是反馈。 */
  function deletePartner(id) {
    /* 行高在 api() 起始那次整页重建前测好带给 --row-h（box-sizing:border-box，含内边距边框），
       .removing 动画从当前高度收到 0 —— 行在动画期间不可再点，收完保持塌缩直到成功回调真正移除 */
    const row=document.querySelector(`[data-action="remove-partner:${id}"]`)?.closest('.partner-row');
    state.partnersRemoving.set(id,row?row.offsetHeight:52);
    return runMutation('/v1/partners/'+id,{},()=>{
      state.partnersRemoving.delete(id);
      state.partners=state.partners.filter(p=>p.id!==id);
      if(state.selectedPartner===id){cancelAI(true);state.selectedPartner='none';state.results=[];}
      persist();
      backToPartners();
    },{method:'DELETE'});
  }
  /* 协议名 → 协议正文整页（主 App，appScreen='legal'）。协议正文原是一个独立页面（/legal/:key），
     2026-09-26 曾降级成浮在当前页上的 sheet 覆盖层，**2026-10-04 按设计图改回整页**：
     页头只有一枚返回箭头（且常驻顶部不随正文滚动消失）、正文首行是大号加粗的协议名（见 appLegalPage），
     没有底部「返回」按钮、也不再显示「项目内置协议快照…」那条说明。
     key 直接取 legal-data.js 的 key（原 'user'/'member' 两个内联映射随登录页 / 会员页删除一并去掉）。 */
  function openAppLegal(key) {
    if(!window.LOVECO_LEGAL || !window.LOVECO_LEGAL[key])return;
    state.legalKey=key;
    openAppLegalPage('legal');
  }
  /* 「记来路」：state.legalFrom 记下打开协议正文页的那一页（appScreen），
     返回箭头（legal-back）与 Esc 都回它（见 legalBack）。
     本页自身重渲染（比如同一层里再点一次）不改记来路。 */
  function openAppLegalPage(screen) {
    abortVoiceHold();
    const from = state.appScreen;
    if (from && from !== screen) state.legalFrom = from;
    else if (!state.legalFrom) state.legalFrom = 'account';
    state.legalKey = state.legalKey || 'terms';
    openAppScreen(screen);
  }
  /* 协议页的返回箭头 / Esc：回 state.legalFrom 那一页（没有来路、或来路是协议正文自身时
     兜底回「我的」） */
  function legalBack() {
    const from = state.legalFrom || 'account';
    state.legalFrom = '';
    openAppScreen(appScreens.has(from) && from !== 'legal' ? from : 'account');
  }
  async function action(a) {
    const [name,...rest]=a.split(':');const arg=rest.join(':');
    if(state.paymentBusy)return;
    /* 原「回到聊天」动作（`return-keyboard`，只在「权益已到账」页用过）随该页删除，勿再补回 */
    /* 底部 Tab（首页 / 对象 / 我的）：三页都是 appScreens 里的整页；未登录点 Tab 不切页，
       进「手机号登录」独立页面（2026-09-29 起登录又是整页，见 openAppLogin）。
       原「我的」小按钮（app-home）与旧 Tab 里的「会员」「键盘」两项随这次重做一起去掉 ——
       会员入口在「我的」的会员横幅上；主 App 已无顶部导航栏，回键盘形态走首页那三处入口
       （2026-10-05 首页重做后又有入口了，见下方 home-* 三条；此前首页清空时只能走工作台左栏的
       App形态切换）。
       **2026-10-04 需求：「我的」这一个 Tab 为例外** —— 未登录也先正常进「我的」页
       （问候行显示「立即登录」），隔 ACCOUNT_LOGIN_DELAY_MS（0.5 秒）再按蜂窝网络开关
       补弹「一键登录」/「手机号登录」页：让用户先看见这一页的样子，而不是被登录页直接挡在门外。
       定时器到点时页面已切走 / 已经登录上就作废（另有 openAppLogin 统一作废，见其开头）。 */
    if(name==='app-tab'){
      if(arg==='account'&&!state.loggedIn){
        openAppScreen('account');
        clearTimeout(state.appLoginDelayTimer);
        state.appLoginDelayTimer = setTimeout(()=>{
          state.appLoginDelayTimer = null;
          if(state.appView==='app'&&state.appScreen==='account'&&!state.loggedIn)openAppLogin();
        }, ACCOUNT_LOGIN_DELAY_MS);
        return;
      }
      if(!state.loggedIn){openAppLogin();return;}
      return openAppScreen(arg);
    }
    /* 首页三处入口（2026-10-05 首页重做；**2026-10-06 需求起三处同一落点**）：
       分析表达 / 自由对话 / 进入体验台都进主 App 的「问AI」页（appAiPage —— AI 咨询师聊天页，
       下半就是键盘里的问AI页）。原先「三处都离开主 App 回键盘形态」的走向作废 ——
       主 App 内从此有了常驻的 AI 聊天入口，回键盘形态只剩工作台左栏的 App形态切换。 */
    if(name==='home-analyze'||name==='home-free-talk'||name==='home-keyboard')return openAppAi();
    /* 首页右上角信封图标（2026-10-05 需求）→ 「消息」整页；消息页返回钮 → 回首页。
       2026-10-06 需求：点信封进消息页即算「已读」—— 首页信封右上角的小红点随之熄灭
       （state.msgUnread 置 false）；刷新页面回到「有未读」的初始态。 */
    if(name==='home-msg'){state.msgUnread=false;return openAppScreen('messages');}
    if(name==='msg-back')return openAppScreen('home');
    /* 「问AI」页的动作组（2026-10-06 需求）：汉堡开/收历史抽屉、编辑按钮与抽屉里的
       「新对话」同一入口开新会话、X 关页面回首页（键盘问AI层随页面收起）、
       抽屉列表点行切换会话。 */
    if(name==='ai-menu'){state.aiHistoryOpen=!state.aiHistoryOpen;return render();}
    if(name==='ai-drawer-close'){state.aiHistoryOpen=false;return render();}
    if(name==='ai-new-chat')return appAiNew();
    if(name==='ai-close'){dismissFreeChat();return openAppScreen('home');}
    if(name==='ai-thread')return appAiOpen(arg);
    /* 「我的」·「账户」组的「会员中心」行 + 会员卡片（memberBanner 右侧那颗白胶囊「升级会员」/
       「立即解锁」）—— **2026-10-06 需求起两处同一个落点**：都进**「会员购买页 · 新」**
       （openAppScreen('purchase2-copy')）。原先「会员中心」行进第一个购买页、卡片进第二个购买页
       （「L+ 会员」purchase2 2026-10-06 已按需求整页删除、卡片改落它的拷贝页）——
       **第一个购买页 purchase 同日也已按需求整页删除**，故两处一并改落这一页；
       选中档位 / 协议勾选框 / 确认框 / 支付渠道都由 openAppScreen 摆成默认态。
       两处都是先 needLogin 拦未登录（与「会员中心」同一口径）。 */
    if(name==='app-membership'||name==='app-membership-plus'){if(needLogin())return;return openAppScreen('purchase2-copy');}
    /* —— 首次登录后的「资料引导」（appOnboardPage，见 finishOnboarding）—— */
    /* 选性别：只改 state.gender（这一步不落库），底部箭头随之点亮 */
    if(name==='onboard-gender'){state.gender=arg;return render();}
    /* 底部箭头：性别这一步 = 进「你的出生日期」；出生日期这一步 = 把滚轮上停着的那天落库并结束引导 */
    if(name==='onboard-next'){
      if(state.onboarding==='birthday'){
        const {y,m,d}=onboardPicked();
        return finishOnboarding(`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
      }
      /* 性别**不可跳过**：没选就不放行（按钮本来就是 disabled，这里是兜底） */
      if(state.gender!=='男'&&state.gender!=='女')return;
      return startOnboarding('birthday');
    }
    /* 出生日期这一步的返回箭头 = 回性别那一步（之前选的性别留着） */
    if(name==='onboard-back')return startOnboarding('gender');
    /* 出生日期**可跳过**：不带生日结束引导（性别已在第一步选好） */
    if(name==='onboard-skip')return finishOnboarding('');
    /* 「我的」·「支持」的两行（2026-10-04 晚些需求：栏目由「客户支持」改名「支持」；
       2026-10-04 再改：**「联系客服」排到「反馈与建议」下面**）：
       「反馈与建议」→ 「问题反馈」页（见下面同名分支）；
       「联系客服」→ 就地弹「联系客服」弹层（supportSheet，**只显示一行客服邮箱**、点即复制，
       2026-10-04 再改：客服微信与服务时间两行都不再显示；**复制完立刻收起弹层** —— 见下面
       support-copy 分支，复制本身就是这一层的出口之一）。
       原首行「键盘内容投诉与举报」（report 动作：进「问题反馈」页并把类型预选成「投诉与举报」）
       已按本轮需求**整行删除** —— 问题类型里的「投诉与举报」那颗胶囊仍在，只是不再有入口预选它；
       本弹层不读登录态（未登录也能联系客服）。 */
    if(name==='support'){state.supportSheet=true;return render();}
    if(name==='support-close'){state.supportSheet=false;return render();}
    /* 弹层里那行的复制（2026-10-04 晚些需求）：邮箱写进剪贴板后**立刻收起弹层**
       —— 复制完即回到「我的」页，不再有「图标变勾 1.2 秒后复原」那一下（弹层收起了看不到）；
       2026-10-04 再改：**同时浮出一记「已复制」轻提示**（showToast，约 1.4s 后自己收掉），
       弹层关了也得让用户知道复制成了 —— 剪贴板不可用时同样照提示、照收起。 */
    if(name==='support-copy'){
      if(arg==='email'){
        try{const p=navigator.clipboard&&navigator.clipboard.writeText(SUPPORT_EMAIL);if(p&&p.catch)p.catch(()=>{});}catch(_){}
        state.supportSheet=false;
        showToast('已复制');
        return;
      }
      return render();
    }
    /* —— 「邀请有礼」页（appInvitePage，2026-10-05 新增）的四个动作 ——
       invite-back：页头返回箭头 / Esc → 回「我的」（本页保留底部 Tab，这是页内唯一返回出口）；
       invite-copy:<code|msg>：两枚复制按钮 —— 专属邀请码 / 自动生成的邀请文案（含本人的码）
         写进剪贴板，按钮文案变「已复制」约 1.2s（inviteCopied，1.2s 后复位）并浮一记轻提示；
         剪贴板不可用也照提示（与客服邮箱那行同一套口径）；
       invite-claim：提交邀请码，校验链见同名分支；
       invite-rules：活动规则「展开全部 / 收起」（默认只露前 3 条）。 */
    if(name==='invite-back')return openAppScreen('account');
    if(name==='invite-copy'){
      const text = arg==='msg' ? inviteMessage(state.inviteCode) : state.inviteCode;
      try{const p=navigator.clipboard&&navigator.clipboard.writeText(text);if(p&&p.catch)p.catch(()=>{});}catch(_){}
      state.inviteCopied = arg==='msg' ? 'msg' : 'code';
      clearTimeout(state.inviteCopiedTimer);
      state.inviteCopiedTimer=setTimeout(()=>{state.inviteCopiedTimer=null;state.inviteCopied='';render();},1200);
      showToast(arg==='msg'?'邀请文案已复制':'邀请码已复制');
      return;
    }
    /* 邀请码提交的校验链（顺序即优先级，一次只报最先命中的一条）：
       ① 空 → ② 格式（6 位字母或数字，输入时已自动转大写）→ ③ 自己的码（不能自邀）→
       ④ 已领取过（每人仅限一次 —— 正常时填写区已换成成功态、点不到提交，这里是兜底）→
       ⑤ 无效（INVITE_DEAD_CODES 里的演示码）→ ⑥ 通过：立即到账 INVITE_DAYS 天
       （grantInviteDays —— 已是会员则在原到期日上顺延），留领取记录并落库。
       校验失败只置 inviteError 重渲染（输入草稿留着，用户改完再提交）。 */
    if(name==='invite-claim'){
      const code=(state.inviteDraft||'').trim().toUpperCase();
      if(!code)state.inviteError='empty';
      else if(!/^[A-Z0-9]{6}$/.test(code))state.inviteError='format';
      else if(code===state.inviteCode)state.inviteError='self';
      else if(state.inviteClaim)state.inviteError='used';
      else if(INVITE_DEAD_CODES.includes(code))state.inviteError='invalid';
      else {
        state.inviteClaim={code,at:Date.now()};
        grantInviteDays(INVITE_DAYS);
        state.inviteError='';state.inviteDraft='';
        persist();
        showToast(`${INVITE_DAYS} 天会员已到账`);
        return;
      }
      return render();
    }
    if(name==='invite-rules'){state.inviteRulesOpen=!state.inviteRulesOpen;return render();}
    /* —— 「问题反馈」页（appFeedbackPage）的三个动作 ——
       feedback-type:<类型>：换选中的问题类型（草稿在 state 里，重渲染不丢已输入内容）；
       feedback-back：页头返回箭头 → 回「我的」（页面没有底部 Tab，这是唯一出口；
       设计图右上角那颗「我的反馈」不呈现 —— 原型里没有反馈历史页）；
       submit-feedback：提交仿真反馈，见下面同名的分支。 */
    if(name==='feedback-type'){if(FEEDBACK_TYPES.includes(arg)){state.feedbackType=arg;render();}return;}
    if(name==='feedback-back')return openAppScreen('account');
    /* —— 「开启键盘」引导（appKbGuideScreen 那条链路）—— */
  if(name==='kb-guide-settings')return openGuideSettings();
  /* 安卓引导第二步「切换到LoveCo输入法」：2026-09-28 起落点是**键盘切换悬浮窗**（ieSwitchSheet）——
     安卓系统不给 App 直接切输入法的权限，这一步的手感就是「点键盘上的切换按钮、在弹出的
     选择器里选 LoveCo」（此前与第一步同一落点、进模拟设置页） */
  if(name==='kb-guide-switch')return openImeSwitch();
  /* 键盘切换悬浮窗里的两个动作：选一行（切换当前输入法并收起本层）/ 点遮罩收起本层 */
  if(name==='kb-guide-ime-pick')return pickGuideIme(arg);
  if(name==='kb-guide-ime-close'){state.kbImeSwitch=false;return render();}
  if(name==='kb-guide-ime-switch')return switchGuideIme();
  /* —— 「切换到 LoveCo 键盘」页（iOS / 鸿蒙引导第二步）的三个动作 ——
     kb-switch-picker：弹出键盘选择器（长按 / 短按地球都由 bindKbSwitchPage 调它）；
     kb-switch-picker-close：点遮罩收起（不改状态）；
     kb-switch-pick:loveco / :system：在选择器里选一套键盘 = 在系统里把当前键盘切过去
     （选 LoveCo 即第二步达成：接着走引导的后半段 —— 状态检查链后两环 → 资料引导 → 最后才是
     「键盘使用引导（演示）」，2026-10-08 需求，见 pickKbSwitch / guideAfterSwitch）；
     kb-switch-settings：去模拟系统设置页。
     原「完成」胶囊的 kb-switch-done 已随切换完成形态一并删除（2026-09-29 需求）。 */
  if(name==='kb-switch-picker')return openKbSwitchPicker();
  if(name==='kb-switch-picker-close')return closeKbSwitchPicker();
  if(name==='kb-switch-pick')return pickKbSwitch(arg);
  if(name==='kb-switch-settings')return openKbSwitchSettings();
  if(name==='kb-guide-ime')return openGuideDetail();
  if(name==='kb-guide-back')return guideBack();
  if(name==='kb-guide-enable')return toggleGuideEnable();
  if(name==='kb-guide-full')return toggleGuideFull();
  if(name==='kb-guide-pip')return guidePipBack();
  if(name==='surface'){
    if(arg===state.appView)return;
    state.docPage=null;
    /* 换 App形态 = 离开当前这一屏：系统支付框（只挂在刚才那一屏上）一并收起 */
    state.iosPaySheet=false;
      /* 切到主 App：不再直接落首页 —— 先按状态检查链过一遍（见 appEntryCheck），
         键盘未开启会整页进「开启键盘」引导；登录层等前面都过了才弹 */
      if(arg==='app'){appEntryCheck();return;}
      return returnKeyboard();
    }
    /* 页面列表：点击列表项 = 手机跳到该页面形态（setup）+ 手机下方显示它的详情（页面路径 / 触发方式 / 功能 / 备注）。
       setup 前先记下 docPage，渲染时列表高亮与详情区都按它来。 */
    /* 页面列表的分组折叠：默认全折叠，点击组名把该组加入 / 移出展开集合（不持久化，重渲染保持） */
    if(name==='page-group-toggle'){
      if(state.pageExpanded[arg])delete state.pageExpanded[arg];else state.pageExpanded[arg]=true;
      return render();
    }
    if(name==='page-doc'){
      const it=pageCatalog().find(x=>x.id===arg);
      if(!it)return;
      state.docPage=arg;
      /* 页面列表是「静态查看某个形态」，与手机里的真实运行状态无关：顺手把「模拟截屏」
         挂起的待分析提示位清掉，免得跳去别的页面时菜单栏还停在上一条截屏的缩略图上
         （本列表里那条「键盘菜单栏 · 待分析截图」自己会重新挂上） */
      state.pendingShot='';
      return setupPage(it);
    }
    /* 切平台：看的是状态栏挖孔与键盘底栏的差异，收起态下看不见 —— 一并弹回键盘 */
    /* 切平台 = 换了一个「键盘运行的环境」：完全访问权限按新平台重算（Android 默认开启）——
       切走时开着的引导层与登录层先收起，再做一次这一轮的前置检查（切到需要授权且没开的平台就重新弹） */
    if(name==='platform'){
      /* 切平台 = 换了台设备：iOS 系统支付框（只属于 iOS）一并收起 */
      cancelAI(true);abortVoiceHold();state.platform=arg;state.modal=null;state.photoPanel=false;state.kbCollapsed=false;state.results=[];state.iosPaySheet=false;persist();
      /* 安卓没有「键盘完全访问」这个权限：切到安卓时按键盘状态把这颗权限一并写齐（见 syncFullAccess） */
      syncFullAccess();
      closeKbLogin();closeKbFullAccess();
      if(state.appView==='keyboard'&&checkKbEntry())return;
      return render();
    }
    if(name==='generate')return generate();
    /* 聊天分析面板：右上 X / Esc 关闭（生成中=取消，完成后=收起清结果）；
       点思路卡任意位置即选中（高亮）——先清空聊天输入框，再把当前选中的回复带进去：
       切换思路 = 替换，不会残留上一条；面板底部的「发送」发的就是**宿主输入框里的内容**
       （选中卡那一步已经把它带进去了），输入框为空时那颗按钮是 disabled（见组件与 theme.css），
       这里再兜一道空内容不发 —— 发完收起面板，与输入栏那颗绿色「发送」同一条链路 */
    if(name==='close-chat-analysis')return closeChatAnalysis();
    if(name==='ca-pick'){
      const i=Number(arg),item=state.results[i];
      if(!item||state.caPicked===i)return;
      state.caPicked=i;
      state.host=item.reply;state.hostCaret=state.host.length;
      return render();
    }
    if(name==='ca-send'){
      if(!state.host.trim())return;
      closeChatPanel();
      sendHost();
      return;
    }
    if(name==='close'){
      /* 主 App：「取消 / 关闭」回打开这张卡片之前的那一页（openModal 记在 modalBack）；
         没有来源（例如直接落在登录页）才退回键盘形态 */
      if(state.appView==='app'){
        const back=state.modalBack;state.modalBack=null;
        return back&&back.modal&&back.modal!==state.appScreen?openAppScreen(back.modal,back.data||{}):returnKeyboard();
      }
      return closeModal();
    }
    if(name==='key')return keypress(arg);
    /* 符号键盘左列的分类标签：只换右侧那 16 个符号，层与键区的其它状态都不动 */
    if(name==='symbol-cat'){state.symbolCat=arg;return render();}
    if(name==='candidate')return commitComposition(currentCandidates()[Number(arg)]);
    /* 九宫格打字时左列的拼音组合：点一条就把输入框里的字母串换成它（候选词随之刷新） */
    if(name==='t9-path'){state.t9Path=Number(arg);return render();}
    /* 候选词栏最右侧的 X：退回菜单栏（顶部栏第一状态） */
    if(name==='exit-typing'){state.composition='';state.t9Path=0;state.typing=false;return render();}
    /* 选键盘布局。键盘设置页（kb-settings 覆盖层）里选完就收起设置页，不用再点返回：
       覆盖层只有一个选择动作，停在原地会让人以为没生效（键区被覆盖层挡着）；
       编辑面板打开时设置页只覆盖下半键盘区域，收起后上方仍是编辑面板
       （在新增 / 修改页面里切形态不跳走）。
       主 App / 键盘形态左栏（平台与app形态板块）的「键盘设置」弹层里选布局则留在弹层 —— 那里还有深色外观等其它开关，
       所以只在覆盖层打开时收起。
       键盘归属：数字 / 符号 / 英文 / 九宫格中文 / 26 键中文是五套独立键盘，只有中文有两套布局
       （26 键 / 九宫格）—— state.layout 记的始终是中文键盘的布局；
       英文键盘下选布局 = 直接切到所选的中文键盘（见 core/ime.js 的 layout()）。 */
    if(name==='layout'){
      state.layout=arg;state.layer='letters';state.composition='';state.t9Path=0;state.language='zh';persist();
      if(state.settingsPanel)state.settingsPanel=false;
      return render();
    }
    /* 左栏「设备权限」的相册访问权限三档（关闭 / 有限访问 / 完整访问）：只记状态，不做拦截 ——
       消费方是键盘选择器（kb-photo-picker）的两套引导形态；面板里的「开启权限」/「去开启权限」
       也走这条动作（仿真「去系统设置开启完全访问」：置成完整访问，面板就地切回正常选择器） */
    if(name==='photos'){state.permissions.photos=arg;return render();}
    /* 左栏「平台与app形态」的当前输入法两档（系统默认 / LoveCo；2026-09-29 起挪到运行平台下面）：选 LoveCo = 在系统里切好了输入法，
       键盘必然是已启用的（未启用的键盘不可能当当前输入法）—— 顺带把「开启键盘」打开；
       若此刻正停在引导流程、两步都已齐，直接完成引导（等价于「返回 App 重新校验」，见 finishGuideIfDone） */
    if(name==='ime'){
      state.permissions.ime=arg;
      if(arg==='loveco')state.permissions.kbEnabled=true;
      syncFullAccess();
      if(finishGuideIfDone())return;
      return render();
    }
    /* 地球 = 仿真「切换输入法」：只装了 LoveCo，所以动的是中文键盘的布局（26 键 ↔ 九宫格）。
       英文键盘是独立键盘、没有第二套布局 —— 英文态下按地球直接切回中文键盘（布局随之切换）。 */
    if(name==='switch-keyboard'){
      const next=state.layout==='t9'?'qwerty':'t9';
      /* 键盘选择器面板开着时，布局变化被面板挡着看不见，所以一并收起面板再提示；
         从编辑面板进来的照旧把面板弹回来（下半仍是键盘，布局切换照常看得见） */
      state.photoPanel=false;state.photoMode='chat';
      if(state.photoBack==='kb-editor')state.kbEditor=true;
      state.photoBack='';
      state.layout=next;state.layer='letters';state.composition='';state.t9Path=0;state.language='zh';persist();render();
      return;
    }
    if(name==='send-host')return sendHost();
    /* 宿主 App 输入栏右侧的表情圆钮：表情面板属于宿主 App，不归 LoveCo 键盘管，这里只做说明 */
    if(name==='emoji-host')return;
    if(name==='incoming'){
      const pool=['你会不会觉得我想得太多了？','周末想去一家新开的书店，要一起吗？','其实跟你聊天，还挺开心的。'];
      const text=pool[state.messages.length%pool.length];state.messages.push({mine:false,text,time:wxStamp(),fresh:true});if(!state.pending&&!state.results.length)state.draft=text;
      closeModal();$('#chat').scrollTop=$('#chat').scrollHeight;clearFreshMessages();return;
    }
    if(name==='account'){if(needLogin())return;return openAppScreen('account');}
    if(name==='membership'){if(needLogin())return;return openPaywall();}
    /* 键盘顶部菜单栏左侧的用户按钮：切换到聊天对象管理页（覆盖整个键盘区域，不覆盖宿主 App 的输入栏）。
       编辑面板也开着时先收起（同一时刻只留一层覆盖层，否则编辑面板渲染在后会盖住管理页） */
    if(name==='partner-manager'){
      /* 主 App「AI 咨询师」页输入行左端那颗头像（2026-10-06 晚些需求）：从底部弹出**对象列表**
         —— 2 行图片高度的窗口（aiSheetHtml 的 partner 形态），选完即收、留在聊天页；
         其余主 App 页仍进「对象」Tab 页（同一份对象数据的管理页；返回后聊天记录还在） */
      if(state.appView==='app'&&state.appScreen==='app-ai')return toggleAaiSheet('partner');
      if(state.appView==='app')return openAppScreen('partners');
      dismissKbEditor();
      abortVoiceHold();state.modal=null;state.modalData={};state.settingsPanel=false;state.photoPanel=false;state.photoBack='';dismissChatPanel();state.partnersEmptyDemo=false;state.partnersRemoving.clear();state.partnerPanel=true;state.panelEnter=true;render();state.panelEnter=false;return;
    }
    if(name==='close-partner-manager'){state.partnerPanel=false;return render();}
    /* 对象编辑面板（kb-partner-editor）的 X / Esc 出口：先静默落库最终值，再回聊天对象管理页
       （与键区功能键「确定」是同一条出口，见 closeKbEditor） */
    if(name==='close-kb-editor'){closeKbEditor();return render();}
    /* 键盘顶部菜单栏最右侧的设置图标：切换到键盘设置页（同一个键盘区域内覆盖层）。
       编辑面板打开时**面板不收起**：设置页只覆盖下半键盘区域、表单面板留在上半
       （上下分区、互不重叠，见 theme.css 的 .keyboard:has(.kb-partner-editor) .kb-settings）——
       在新增 / 修改页面里点设置、切键盘形态，上方区域都不会消失，草稿继续留在 modalData 里。
       其余来源（键盘底座 / 页面列表）照旧清掉弹层草稿、设置页铺满整个键盘区域；
       管理页 / 选图选择器与编辑面板重叠，仍先收起面板（见 dismissKbEditor）。 */
    if(name==='kb-settings'){
      abortVoiceHold();state.modal=null;state.partnerPanel=false;state.photoPanel=false;state.photoBack='';dismissChatPanel();
      if(!state.kbEditor)state.modalData={};
      state.settingsPanel=true;state.panelEnter=true;render();state.panelEnter=false;return;
    }
    if(name==='close-kb-settings'){state.settingsPanel=false;return render();}
    /* 键盘菜单栏相册（图片）图标左侧的气泡按钮：进入问AI 页 —— 与 AI 对话的页面
       （键盘顶部换成「问AI」标题栏 + 提问输入行，键区照常在下，见 kb-free-chat 组件）。
       出口是标题栏的 X（close-free-chat）与 Esc。 */
    if(name==='free-chat')return openFreeChat();
    if(name==='close-free-chat'){
      /* 主 App「AI 咨询师」页：标题栏的 X = 收起调出的键盘（回贴底输入栏，页面不退、草稿不丢） */
      if(state.appView==='app'&&state.appScreen==='app-ai'){state.aaiKb=false;state.aaiSheet='';state.freePicker=false;return render();}
      return closeFreeChat();
    }
    /* 问AI 页图片选择器的四个动作（内嵌形态：网格盖住键区，见 openFreePicker）——
       free-picker = 输入行右端的图片按钮（开 / 关同一枚按钮；展开且已选图时这枚按钮变成
       「发送」，所以开关与补选分别由下面两条走），free-picker-add = 缩略图行尾的「+」
       （展开时再挑一张；收起时也是唯一的补选入口），free-send = 展开时的蓝色发送按钮（箭头），
       free-shortcut:<id> = 快捷栏那一行预设问题 —— **点一下立即发送**，id 决定结果结构。
       缩略图上的移除复用选择器的 photo:<id>（已选中再点即取消，与网格里点同一张等价）。
       主 App「AI 咨询师」页里这两条都改落底部弹窗（aiSheetHtml 的 photo 形态）：图片按钮开 / 关，
       「+」只负责把弹窗打开（弹窗开着时点它不该反手关掉）。 */
    if(name==='free-picker'){
      if(state.appView==='app'&&state.appScreen==='app-ai')return toggleAaiSheet('photo');
      return toggleFreePicker();
    }
    if(name==='free-picker-add'){
      if(state.appView==='app'&&state.appScreen==='app-ai'){if(state.aaiSheet!=='photo')openAaiSheet('photo');return;}
      return openFreePicker();
    }
    if(name==='free-send')return sendFreeChat();
    if(name==='free-shortcut')return pickFreeShortcut(arg);
    /* 键盘顶部菜单栏的相册图标：从下往上弹出键盘选择器（「选择聊天截图（最多3张）」），
       面板覆盖整个键盘区域，键盘整块拉高到手机屏幕的三分之二（.keyboard.with-picker，见 theme.css）。
       每次打开都从空选择开始。 */
    if(name==='photo-picker')return openPhotoPanel();
    if(name==='close-photo-picker')return closePhotoPanel();
    if(name==='select-partner'){
      /* 第三方 App 是固定聊天模板：切对象不动会话（消息 / 草稿原样保留），只重置键盘侧的生成。
         主 App「AI 咨询师」页从底部弹窗里选：**选完即收、留在聊天页**（输入行头像随之更新）；
         其余主 App 形态选完留在「对象」页（这一页就是对象列表）；键盘形态回管理页 */
      cancelAI(true);state.selectedPartner=arg;state.results=[];state.host='';state.partnerPanel=false;
      if(state.appView==='app'&&state.appScreen==='app-ai'){state.aaiSheet='';state.freePicker=false;return render();}
      if(state.appView==='app')return openAppScreen('partners');
      closeModal();return;
    }
    if(name==='new-partner'){
      if(needLogin())return;
      Object.keys(state.formCache).filter(k=>k.startsWith('partner-edit::')).forEach(k=>delete state.formCache[k]);
      /* 键盘模式打开整页编辑面板（kb-partner-editor），主 App 形态保持弹层 */
      return state.appView==='keyboard'?openKbEditor():openModal('partner-edit');
    }
    if(name==='edit-partner'){
      if(needLogin())return;
      return state.appView==='keyboard'?openKbEditor({id:arg}):openModal('partner-edit',{id:arg});
    }
    if(name==='choose-avatar')return $('#avatar-input')?.click();
    /* 编辑面板的头像入口：进图片选择器的头像模式（单选、底部「确定」），先把手填草稿存回 modalData */
    if(name==='avatar-photo-picker'){
      /* 名字取「已确认文字」（partnerBaseName）：输入框的显示值里可能带着还没确认的拼音字母 */
      state.modalData.name=partnerBaseName();
      state.modalData.stage=$('#partner-stage')?.value??state.modalData.stage;
      state.selectedPhotos=[];
      return openPhotoPanel([],'avatar');
    }
    /* 头像模式的「确定」：把选中图片居中裁成方形 dataURL 存进草稿，回到编辑面板 */
    if(name==='confirm-avatar'){
      const item=avatarItems().find(s=>s.id===state.selectedPhotos[0]);
      if(!item?.image)return;
      const image=new Image();
      image.onload=()=>{
        const size=320,canvas=document.createElement('canvas'),context=canvas.getContext('2d');
        canvas.width=size;canvas.height=size;
        const side=Math.min(image.naturalWidth,image.naturalHeight);
        context.drawImage(image,(image.naturalWidth-side)/2,(image.naturalHeight-side)/2,side,side,0,0,size,size);
        state.modalData.avatar=canvas.toDataURL('image/jpeg',0.85);
        scheduleKbPartnerSave();
        /* 解码是异步的：这期间用户可能已经离开这条链路（面板收起 / 跳页），
           那就只把选好的头像落进草稿，不再把编辑面板弹回来 */
        if(state.photoBack!=='kb-editor')return;
        state.selectedPhotos=[];state.photoPanel=false;state.photoMode='chat';state.photoBack='';state.kbEditor=true;
        render();
      };
      image.src=item.image;
      return;
    }
    if(name==='save-partner'){
      /* 主 App 弹层（partnerEditor）的「确定」保存；键盘编辑面板没有确定键，走静默保存
        （scheduleKbPartnerSave / settleKbPartner）。弹层有性别 / 备注信息两栏，键盘面板缺栏时保留对象原有值 */
      const id=state.modalData.id,prev=state.partners.find(p=>p.id===id),n=$('#partner-name').value.trim(),stage=normalizeStage($('#partner-stage').value);
      const gender=$('#partner-gender')?$('#partner-gender').value:(prev?.gender||'暂不设置');
      const note=$('#partner-note')?$('#partner-note').value.trim():(prev?.note||'');
      const avatarData=state.modalData.avatar||prev?.avatar||'';
      state.modalData.name=n;state.modalData.stage=stage;
      if(!n)return;
      if(state.partners.some(p=>p.name===n&&p.id!==id))return;
      return runMutation('/v1/partners'+(id?'/'+id:''),{name:n,gender,stage,note},()=>{
        const p=state.partners.find(x=>x.id===id)||{id:id||'p'+Date.now(),color:'blue'};
        Object.assign(p,{name:n,gender,stage,note,avatar:avatarData});
        frontPartner(p);
        persist();
        if(state.kbEditor){state.kbEditor=false;state.partnerPanel=true;}
        backToPartners();
      },{method:id?'PATCH':'POST'});
    }
    /* 删除聊天对象只有一条入口：列表左滑露出的删除按钮，直接删、不弹二次确认
       （编辑器里的「删除这个对象」按需求去掉后，原先那条确认框链路（delete-partner /
       delete-partner-confirm）已整体删除）。 */
    if(name==='remove-partner')return deletePartner(arg);
    /* 通用确认弹层的确认动作（confirm-action）随「重置会话」功能于 2026-10-03 一并删除，勿补回 */
    /* 「模拟截屏」（左栏「模拟」/ 仿真控制台的同名按钮，两处都只在键盘形态渲染 —— 2026-10-06 需求）：
       仿真按一下系统截屏键 ——
       键盘激活就直接进 AI 分析链路；键盘不在屏就只把截图放进相册、等键盘唤起后再提示（见 takeScreenshot） */
    if(name==='sim-screenshot')return takeScreenshot();
    /* 「模拟好友使用AI」（左栏「模拟」组，仅主 App 形态渲染）：推进「我作为邀请方」的邀请链路 ——
       待激活转已到账 + 补发阶梯奖励，见 simInviteUse */
    if(name==='sim-invite-use')return simInviteUse();
    /* 「键盘使用引导」（kb-usage-guide 组件，纯演示的假页面）：打开 / 按步推进
       （推进动作见 gxAdvance —— 每一步的 arg 必须等于当前步，连点推进不了） */
    if(name==='kb-usage-guide')return openKbUsageGuide();
    if(name==='gx-next')return gxAdvance(arg);
    /* 菜单栏的「待分析截图」缩略图（这个形态下它取代了相册图标）：点它 = 直接分析这张截图，
       不再经过选图面板 —— 三关都过时才会露脸，点掉后菜单栏回到普通相册图标 */
    if(name==='pending-shot'){
      const item=pendingShotItem();
      if(!item)return;
      state.pendingShot='';
      return analyzePhotos([item]);
    }
    if(name==='photo'){
      /* 头像模式单选：再点已选中的取消，点别的直接替换 */
      if(state.photoMode==='avatar'){state.selectedPhotos=state.selectedPhotos[0]===arg?[]:[arg];return render();}
      const i=state.selectedPhotos.indexOf(arg);if(i>=0)state.selectedPhotos.splice(i,1);else if(state.selectedPhotos.length>=3)return;else state.selectedPhotos.push(arg);return render();
    }
    /* 选图面板的「立即分析」：把选中的截图交给 AI 分析链路（见 analyzePhotos） */
    if(name==='attach-photos'){
      const photos=state.selectedPhotos.map(id=>photoItems().find(s=>s.id===id)).filter(Boolean);
      return analyzePhotos(photos);
    }
    /* —— 登录层（kb-login 组件）的五个动作：关 / 切形态 / 一键登录 / 发码 / 短信用 ——
       主 App 与键盘共用这一套（原主 App 登录页自己的 sms / login-submit 两个动作已随整页删除）：
       验证码 123456、发码后自动把验证码填成 123456、登录成功即置已登录并落库。
       区别只在登录成功后：键盘形态收起登录层继续用键盘；主 App 形态收起后停原页（两者都是 render）。
       X 关闭只是关掉本次登录，状态仍是未登录 —— 键盘下次唤起、主 App 下次触发需要登录的操作时再弹。 */
    /* —— 完全访问引导层（kb-full-access）的两个动作 ——
       「去开启」= 仿真「去系统设置开启完全访问」（把权限置成已开启），接着做登录检查（先权限后登录）；
       顶条右上角的叉号 = 关掉这一层、回到键盘页（键盘继续可用，只是权限还没开 ——
       收起键盘后下次唤起还会再弹一次，与 Esc 同一条出口）。 */
    if(name==='kb-full-access-open'){grantKbFullAccess();return;}
    if(name==='kb-full-access-close'){closeKbFullAccess();return render();}
    if(name==='close-kb-login'){if(state.appView==='app'&&(state.appScreen==='login'||state.appScreen==='login-one-tap'))closeAppLogin();else closeKbLogin();return render();}
    /* 协议正文页（kb-legal）：X / Esc 关掉只收起本页、回登录层 —— 协议勾选状态不动 */
    if(name==='close-kb-legal'){closeKbLegal();return render();}
    /* 键盘内付费引导的 X：只收起这一层回键盘（额度仍是 0，再发起生成还会弹） */
    if(name==='kb-paywall-close'){closeKbPaywall();return render();}
    /* 登录层 / 购买页协议行里的协议名（kb-legal:<key>）：正文与主 App 协议正文页同一份
       legal-data.js 快照，**按 App形态分家**（2026-10-04 需求）——
       主 App（两张登录页的勾选行与「请阅读并同意以下条款」弹框、购买页的协议行）打开
       **协议正文整页**（appScreen='legal'，返回箭头回来路页：登录页 / 购买页，表单与勾选状态都留着）；
       键盘形态仍是键盘区域内的整页覆盖层（kb-legal，高度只有一条键盘，塞不下整机页面）。 */
    if(name==='kb-legal'){if(state.appView==='app')return openAppLegal(arg);openKbLegal(arg);return;}
    /* 「请阅读并同意以下条款」弹框的两个动作（2026-09-29 需求，主 App 登录页专属 —— 未勾选协议就点
       主按钮时由 askKbConsent 弹出，见 kb-login 组件的 .kbl-ask）：
       X = 只收起弹框、仍不算勾选；「同意并继续」= 视作勾选（页面底部协议行同步变成已勾选）
       并接着把刚才被拦下的那次登录跑完（kbConsentNext 记的是 kb-login-one-tap / kb-login-submit）。 */
    if(name==='kb-consent-close'){closeKbConsentAsk();return render();}
    if(name==='kb-consent-agree'){
      const next=state.kbConsentNext;
      closeKbConsentAsk();
      state.kbLoginConsent=true;
      return next?action(next):render();
    }
    /* 一键登录页的「手机号登录」入口：键盘形态就地换成短信表单（不重放滑入动画）；
       主 App 的「一键登录」页则跳到独立的「手机号登录」页（2026-09-29 需求：两页各占一个 appScreen，
       来路页 appLoginReturn 不变 —— 回来路还是回到进登录前那一页）。
       跳过去的「手机号登录」页同样从「未勾选协议」开始（2026-09-29 需求：手机号页面默认不勾选协议，
       所以这里也把勾选清掉；键盘形态就地换表单仍是共用同一份勾选状态、保留勾选） */
    if(name==='kb-login-sms'){
      state.kbLogin='sms';
      if(state.appView==='app'&&state.appScreen==='login-one-tap'){state.appScreen='login';state.kbLoginConsent=false;}
      return render();
    }
    if(name==='kb-login-one-tap'){
      /* 协议未勾选：不静默 return —— 键盘形态让底部协议行抖一下（shakeKbConsent），
         主 App 的「一键登录」页弹「请阅读并同意以下条款」弹框（askKbConsent） */
      if(!state.kbLoginConsent)return state.appView==='app'?askKbConsent('kb-login-one-tap'):shakeKbConsent();
      return runMutation('/v1/auth/one-tap/login',{phone:state.phone,carrier:'中国联通',simulated:true},()=>{finishKbLogin();});
    }
    if(name==='kb-login-send'){
      if(state.kbLoginBusy)return;
      const phone=state.kbLoginPhone.trim();
      if(!/^1\d{10}$/.test(phone))return;
      state.kbLoginBusy=true;
      try{await api('/v1/auth/sms/send',{phone:phone.slice(0,3)+'****'+phone.slice(-4)});state.kbLoginSent=true;state.kbLoginCode='123456';}
      catch(e){}finally{state.kbLoginBusy=false;render();}return;
    }
    if(name==='kb-login-submit'){
      /* 协议未勾选：与一键登录同一套提示（能点到这颗按钮说明手机号 / 验证码已填齐）——
         键盘形态抖协议行、主 App 的「手机号登录」页弹同一个弹框 */
      if(!state.kbLoginConsent)return state.appView==='app'?askKbConsent('kb-login-submit'):shakeKbConsent();
      const phone=state.kbLoginPhone.trim(),code=state.kbLoginCode.trim();
      if(!/^1\d{10}$/.test(phone)||code!=='123456')return;
      return runMutation('/v1/auth/sms/login',{phone:phone.slice(0,3)+'****'+phone.slice(-4),code:'[已脱敏]'},()=>{
        /* 登录成功：号码写进「上次登录」，下次唤起键盘弹的是一键登录页（一键登录也用它当本机号） */
        state.phone=phone.slice(0,3)+'****'+phone.slice(-4);
        finishKbLogin();
      });
    }
    /* 退出登录：清掉会话态；未登录进「手机号登录」独立页面（来路记为首页，改主意可当场再登回来） */
    if(name==='logout'){cancelAI(true);state.accountEpoch++;state.loggedIn=false;state.results=[];persist();state.appView='app';state.appScreen='home';state.modal='home';state.modalData={};openAppLogin();return;}
    /* —— 「用户」页（原「个人资料」，2026-10-04 按设计图重做）的动作 ——
       行内两处编辑都走就地弹层（见 appUserPage / userSheet）：
         edit-gender / edit-birthday 打开对应弹层（出生日期弹层先按当前生日
         初始化滚轮，见 initUserPick）—— 性别只在还没设置过时行上才有这个动作，
         设置过之后行不可点（「设置后不可修改」，见 appUserPage）；user-sheet-close 只收弹层（X 与 Esc 共用）；
         pick-gender:<值>（点即改并收层）/ save-birthday（把滚轮停着的那天写回
         state.birthday，顺带对上 age 档）是两个落地动作；
         copy-member-id 把用户 ID 写进剪贴板，图标变勾约 1.2 秒后复原（没有别的提示 ——
         轻提示组件已按需求删除）；user-back 返回「我的」。
       昵称改名（edit-nickname / save-nickname，PATCH /v1/me 仿真）随「昵称」行于 2026-10-04
       按反馈一并删除（该接口至此没有调用方）—— 昵称仍留在存档里（聊天页「我」的头像兜底照用；
       问候行自 2026-10-04 晚些起改报手机号掩码，已不再用昵称），只是本页不再显示、也没有改昵称的入口。
       「注销账号」那一行点它进独立的注销页（user-cancel → appScreen='cancel-account'，
       2026-10-04 需求；注销链路 2026-09-26 曾整体删除，现按新设计图重建为
       「独立页 + 成功弹框」，与旧确认框链路无关）。 */
    if(name==='user-back')return openAppScreen('account');
    if(name==='user-cancel')return openAppScreen('cancel-account');
    if(name==='edit-gender'){state.userSheet='gender';return render();}
    if(name==='edit-birthday'){initUserPick();state.userSheet='birthday';return render();}
    if(name==='user-sheet-close'){state.userSheet='';return render();}
    if(name==='pick-gender'){state.gender=arg;state.userSheet='';persist();return render();}
    if(name==='save-birthday'){
      const {y,m,d}=userPicked();
      state.birthday=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const band=ageBand(ageFrom(y,m,d));if(band)state.age=band;
      state.userSheet='';persist();return render();
    }
    if(name==='copy-member-id'){
      try{const p=navigator.clipboard&&navigator.clipboard.writeText(state.memberId);if(p&&p.catch)p.catch(()=>{});}catch(_){}
      state.memberIdCopied=true;
      clearTimeout(state.memberIdTimer);
      state.memberIdTimer=setTimeout(()=>{state.memberIdCopied=false;render();},1200);
      return render();
    }
    /* —— 「注销账号」链路的其余动作（2026-10-04 需求，页见 appCancelPage / cancelAskSheet）——
       cancel-back：注销页返回箭头 → 回「用户」页；
       cancel-submit：「确认注销」→ 弹「注销申请成功」弹框（7 天冷静期说明）；
       cancel-ok：弹框唯一按钮「知道了」→ 收起弹框、回首页。 */
    if(name==='cancel-back')return openAppScreen('profile');
    if(name==='cancel-submit'){state.cancelAsk=true;return render();}
    if(name==='cancel-ok'){state.cancelAsk=false;return openAppScreen('home');}
    /* 旧的「注销仿真账户」确认框链路（delete-account → delete-account-confirm）已于 2026-09-26
       按需求整体删除：「我的」页当时不再有注销入口、state.deleted 也随之清除；2026-10-04 起
       注销按新设计图重建为「用户」页入口 → 独立注销页 → 成功弹框（见上面的 user-cancel / cancel-*），
       旧确认框形态不受影响、勿按旧链路补回。 */
    /* 会员开通覆盖层的三档商品卡：选中即切换 state.kbPlan（主 App 与键盘共用同一个选中态） */
    if(name==='kb-plan'){state.kbPlan=arg;return render();}
    /* 「立即解锁」（**键盘会员开通层专用** —— kb-paywall 的 CTA；2026-10-06 起主 App 的
       「会员购买页 · 新」走自己的 p2-buy，那颗按钮带协议确认框）：按平台 / 形态分三路（2026-09-28 需求）——
       iOS：不跳转也不当场到账，就地弹出 iOS 系统支付框（App Store 内购确认，ios-pay-sheet），
            在支付框里点确认（ios-pay-confirm）才走 completePurchase；
       安卓 / 鸿蒙的键盘形态：跳转到主 App 的会员购买页（gotoAppPurchase → purchase2-copy），
            到主 App 里再完成购买；
       其余（安卓 / 鸿蒙的主 App 形态）：一键到账（completePurchase，见其注释）。
       会员开通层的协议行**没有勾选框**（2026-09-29 五次需求），点它不再有前置拦截 ——
       协议行只是可读、可点开正文。 */
    if(name==='purchase'){
      if(state.paymentBusy)return;
      if(state.platform==='ios')return openIosPaySheet();
      if(state.appView==='keyboard')return gotoAppPurchase();
      return completePurchase();
    }
    /* 会员购买页的支付渠道（2026-09-29 三次需求）：安卓 / 鸿蒙那一行**首选支付宝**，点一下切到
       微信支付、再点切回来（只翻 state.purchasePay，不落库 —— 每次进页都回到首选支付宝）。
       只影响这一行的图标 / 文案与《自动续费协议》的显示（见 appPurchasePlusCopyPage 的 renewing）：
       切到微信支付时那行协议隐藏；试付进行中（paymentBusy）不给切，避免付到一半换渠道。
       iOS 不渲染这一行（Apple 内购走系统支付框），没有这个动作。
       **2026-10-06 起只剩「会员购买页 · 新」用这一个动作**（第一个购买页已整页删除）。 */
    if(name==='purchase-pay'){
      if(state.paymentBusy)return;
      state.purchasePay = state.purchasePay==='wechat' ? 'alipay' : 'wechat';
      return render();
    }
    /* —— 「会员购买页 · 新」的动作组（2026-10-06 新增，页见 appPurchasePlusCopyPage）——
       p2-plan：三张档位卡，选中即切换 state.pu2Plan（只影响本页 —— 与键盘会员开通层的 state.kbPlan
                各自独立，见 checkoutPlan；**2026-10-06 起主 App 的购买只有这一页**）；
                **2026-10-06 晚些需求：切到不同档直接弹协议确认框（state.pu2Ask），
                点「同意」立即按新档支付** —— 点当前那张卡不算切换；
       p2-agree：协议行那枚圆形勾选框，只翻 state.pu2Agreed（视觉切换；未勾选时主按钮会先弹
                协议确认框，见 p2-buy —— 原「购买不前置勾选、无拦截」口径已被取代）；
       p2-buy：紫渐变主按钮「立即解锁」（2026-10-06 需求：原「¥xx 购买 xx 会员」；晚些需求起按钮不再显示价格）
               —— **未勾选协议先弹协议确认框（p2-ask-ok 确认后立即继续支付）**；与键盘会员开通层的
               「立即解锁」同一条分路（iOS 就地弹系统支付框、
               安卓 / 鸿蒙主 App 形态一键到账；这一页只存在于主 App 形态，没有键盘跳转那一支）；
       p2-redeem：「兑换码」白胶囊（原「会员兑换」，2026-10-05 四次需求改名且仅安卓 / 鸿蒙渲染）——
               **2026-10-06 需求起弹半屏的「兑换码」底部弹层**（redeemSheet / state.redeemSheet，
               原「兑换码即将开放」轻提示作废）：每次打开开一张新表单（草稿清空、错误与成功态复位、
               滑入动画只在这一遍播）；
       redeem-close / redeem-done：弹层的 X / Esc 与成功后的「完成」—— 都只收弹层、仍停在购买页；
       redeem-submit：弹层里的「立即兑换」—— 空 / 格式 / 已用过 / 无效 / 永久会员五道校验
               （REDEEM_ERRORS 一套提示），**2026-10-06 再晚些需求：有效码通过校验后还要掷一次
               硬币 —— 随机失败只给一行「抱歉，兑换失败」（不到账、不消耗码，可重试）；
               静态码的无效文案同时简化为「兑换码无效或已过期」**；成功即按 REDEEM_CODES 的
               天数当场到账（grantRedeemDays）并把码记进 state.redeemUsed（落库），卡内切成功态；
       p2-close：**左上角那枚圆形叉号**（2026-10-05 需求补的可见出口 —— 原来照设计图只有标题、
                     没有关闭钮、Esc 是唯一出口）→ 与 Esc 同一条出口（leavePurchasePage）：
                     **命中弹窗条件时点它不退出页面，先弹「永久会员立减优惠」挽留弹窗**
                     （pu2OfferSheet / state.pu2Offer；2026-10-06 再改条件：**首启引导必弹、
                     其余情况随机 1/4 命中才弹、当天已弹过一律不弹**），没弹才照原路退出
                     （自动弹出的那一次回首页、其余 openAppScreen('account') 回「我的」）
                     （**2026-10-06 起本页是主 App 唯一的会员购买页**，这一条就是购买页的出口 ——
                     第一个购买页那枚右上角的 purchase-close 已随该页整页删除，勿再补回）；
              offer-close / offer-claim：「永久会员立减优惠」挽留弹窗的两颗按钮（2026-10-06 需求，
                     页见 pu2OfferSheet）—— offer-close 是弹窗右上角那枚 x：**放弃优惠 + 退出**，
                     收层并一路退出购买页（leaveOfferSheet：自动弹出的那一次回首页、其余回「我的」，
                     与用户原本点购买页 x 的意图一致）；offer-claim 是「领取优惠」：
               记下优惠（offerClaimed 落库 → 永久档随即按 128 显示）+ **直接进入支付** ——
               关层后按下与 p2-buy 同一条分路继续（未勾协议先弹协议确认框，点「同意」即
               勾上并继续；iOS 弹 iOS 系统支付框 / 安卓·鸿蒙一键到账）；
       支付渠道复用上面的 purchase-pay（安卓 / 鸿蒙点那一行切支付宝 / 微信支付，进页回首选支付宝）。
       Esc 链先弹层、后页面（见 keydown 的 Esc 链）。 */
    if(name==='p2-plan'){
      if(state.paymentBusy)return;
      if(state.pu2Plan===arg)return; // 点的就是当前档，不算「切换」、不弹框
      state.pu2Plan=arg;
      /* 2026-10-06 晚些需求：切换会员商品栏（档位卡）直接弹协议确认框，确认后立即按新档支付 */
      state.pu2Ask=true;
      return render();
    }
    if(name==='p2-agree'){state.pu2Agreed=!state.pu2Agreed;return render();}
    if(name==='p2-redeem'){
      state.redeemSheet=true; state.redeemDraft=''; state.redeemError=''; state.redeemDone=null;
      state.redeemEnter=true; render(); state.redeemEnter=false; return;
    }
    if(name==='redeem-close'||name==='redeem-done'){state.redeemSheet=false;return render();}
    if(name==='redeem-submit'){
      const code=(state.redeemDraft||'').trim();
      if(!code){state.redeemError='empty';return render();}
      if(!/^[A-Z0-9]{4,12}$/.test(code)){state.redeemError='format';return render();}
      if(state.redeemUsed.includes(code)){state.redeemError='used';return render();}
      const days=REDEEM_CODES[code];
      /* 不在码表里 = 「无效或已过期」（仿真约定；真机由服务端判定归属与有效期） */
      if(!days){state.redeemError='invalid';return render();}
      /* 永久会员不再叠加：给确定性的提示，不参与下面那记掷硬币 */
      if(state.member && state.memberExpiry===0){state.redeemError='forever';return render();}
      /* 2026-10-06 再晚些需求：点「立即兑换」**随机出现成功 / 失败** —— 有效码掷一次硬币，
         失败只给一行「抱歉，兑换失败」（仿真服务端偶发失败；不到账、不消耗码，可重试） */
      if(Math.random()<0.5){state.redeemError='failed';return render();}
      if(!grantRedeemDays(days)){state.redeemError='forever';return render();}
      state.redeemUsed.push(code);
      state.redeemError=''; state.redeemDone={days};
      persist(); return render();
    }
    /* 购买页的出口（p2-close = 左上角那枚圆形叉号；Esc 是同一条，见 Esc 链）——
       **2026-10-06 需求：命中弹窗条件时先弹「永久会员立减优惠」挽留弹窗**（首启引导必弹、
       其余随机 1/4 命中才弹、当天已弹过一律不弹）；**没弹时自动弹出的那次
       （首页等 1 秒弹出来的付费墙）回首页**，手动进本页的回「我的」（见 leavePurchasePage） */
    if(name==='p2-close')return leavePurchasePage();
    /* 「永久会员立减优惠」挽留弹窗的出口（2026-10-06 需求，页见 pu2OfferSheet）——
       offer-close：弹窗右上角那枚 x = 放弃优惠 + 退出购买页（回首页 / 回「我的」，
       与购买页出口同口径，见 leaveOfferSheet）；
       offer-claim：「领取优惠」= 记下优惠（落库 → 永久档按 128 显示）+ **直接进入支付**：
                   关层后按下与 p2-buy 同一条分路（未勾协议先弹协议确认框 —— 点「同意」
                   即勾上并继续；已勾选直接 iOS 弹系统支付框 / 安卓·鸿蒙一键到账）。 */
    if(name==='offer-close')return leaveOfferSheet();
    /* 首页那颗「限时特惠」悬浮卡：点一下 = 直接调起支付（见 payFromOfferBadge）——
       拖动不触发（bindOfferBadge 里拖过的那一下不算点击） */
    if(name==='offer-badge')return payFromOfferBadge();
    if(name==='offer-claim'){
      if(state.paymentBusy)return;
      closeOfferSheet();
      state.offerClaimed=true; state.pu2Plan='permanent'; persist();
      if(!state.pu2Agreed){state.pu2Ask=true;return render();}
      if(state.platform==='ios')return openIosPaySheet();
      return completePurchase();
    }
    /* 协议确认框的两颗按钮：取消只收框；「同意」= 勾上协议 + 立即调起支付
       （iOS 表现为弹 iOS 系统支付框，安卓 / 鸿蒙一键到账 —— 与 p2-buy 勾选后同一条分路） */
    if(name==='p2-ask-cancel'){state.pu2Ask=false;return render();}
    if(name==='p2-ask-ok'){
      if(state.paymentBusy)return;
      state.pu2Ask=false; state.pu2Agreed=true;
      if(state.platform==='ios')return openIosPaySheet();
      return completePurchase();
    }
    if(name==='p2-buy'){
      if(state.paymentBusy)return;
      /* 2026-10-06 晚些需求：未勾选协议先弹协议确认框，点「同意」才继续支付；
         已勾选则直接走下面的分路 */
      if(!state.pu2Agreed){state.pu2Ask=true;return render();}
      if(state.platform==='ios')return openIosPaySheet();
      return completePurchase();
    }
    /* iOS 系统支付框的两个出口：X = 取消购买（只收起支付框、回会员开通层，不到账）；
       确认区 = 确认支付（真机是双击侧边按钮），走完仿真支付、权益到账并连同会员开通层一起收起 */
    if(name==='ios-pay-close'){closeIosPaySheet();return render();}
    if(name==='ios-pay-confirm')return completePurchase();
    /* 「问题反馈」页的提交（appFeedbackPage 的整宽按钮）：描述与联系方式都从 state 的草稿取
       （页面是整页结构，字段值不进 formCache），连同选中的问题类型一起 POST。
       描述不足 5 个字不提交（原 sheet 的判据照旧），焦点交回描述框提示用户补充；
       提交成功回「我的」（原落点是已删除的「我的反馈」页，反馈不留历史列表）。 */
    if(name==='submit-feedback'){
      const text=(state.feedbackText||'').trim(),contact=(state.feedbackContact||'').trim();
      if(text.length<5){$('#feedback-text')?.focus({preventScroll:true});return;}
      return runMutation('/v1/feedback',{type:state.feedbackType,text,contact},()=>openAppScreen('account'));
    }
    /* 协议名 → 协议正文整页（「我的」四条直链 / 注销页《账号注销协议》/ 登录页与购买页协议行，
       见 openAppLegal；2026-10-04 需求前它打开的是覆盖层。原「关于 LoveCo」页的协议卡
       2026-10-06 需求已整块删除，不再是入口之一） */
    if(name==='legal')return openAppLegal(arg);
    /* 协议正文页的返回箭头（2026-10-04 需求）：回打开它的那一页（state.legalFrom）；
       Esc 是同一条出口（见 keydown 的 Esc 链）。原来的 app-legal-close（收覆盖层）已随覆盖层一并删除。 */
    if(name==='legal-back')return legalBack();
    /* 「关于 LoveCo」整页（appScreen='about'，2026-10-04 晚些需求）：从「我的」·「更多」组那一行进
       （about）；页头返回钮（about-back）与 Esc 都回「我的」（本页不属于任何 Tab，也不校验登录态
       —— 与「我的」页本身一致）。本页 2026-10-06 需求起**没有可点的协议行**（「隐私与协议」卡片
       整块删了），页面上只剩品牌区与备案行。 */
    if(name==='about')return openAppScreen('about');
    if(name==='about-back')return openAppScreen('account');
    /* 「我的」·「账户」组的两行（2026-10-04 需求：这一组排在「支持」之上）：
       「会员中心」走上面的 app-membership 分支 → 会员购买页（**2026-10-05 需求：原「会员与积分」行改名「会员中心」**）；
       「邀请有礼」→ **「邀请有礼」整页**（2026-10-05 新增：原型里已有这一页，原「即将上线」
       轻提示这一支随之撤掉）—— 未登录先由 needLogin 拦到登录页（与「会员中心」同一口径），
       登录后落 appScreen='invite'。 */
    if(name==='invite'){if(needLogin())return;return openAppScreen('invite');}
    /* 「重置会话 / 重置本地仿真」链路（reset 确认弹窗 → reset-confirm 清 localStorage 并刷新）已于
       2026-10-03 按需求整体删除：两形态顶部菜单栏的按钮、窄屏工具条的图标按钮与「仿真控制台」里的
       「重置全部本地仿真数据」三处入口一并移除 —— 工作台不再有重置入口，勿补回。 */
    /* 原「确认模拟订单 / 权益已到账 / 模拟订单 / 兑换积分 / 我的反馈 / 键盘设置」六个页面已删除，
       各自的动作（checkout / pay / cancel-payment / redeem-submit / tickets）随之移除。
       simulator = 打开「仿真控制台」弹层：现在只有键盘形态（窄屏工具条的「仿真设置」按钮）会触发，
       主 App 形态的入口（右栏 APP STATE 与窄屏工具条按钮）2026-09-29 已删除 —— 白名单保留给键盘形态。 */
    if(['simulator','profile','feedback'].includes(name)){
      if(['profile','feedback'].includes(name)&&needLogin())return;
      if(appScreens.has(name))return openAppScreen(name);
      return openModal(name);
    }
  }
  /* 登录层（kb-login）的两个输入框与协议勾选：实时回存 state（重渲染不丢），
     手机号 / 验证码填齐与否则决定「登录」按钮的禁用态 —— 只在可用性翻转的那一下补一次渲染
     （每敲一个字都整页重建会打断输入），勾选框只记状态、不需要重渲染。
     这一层在**主 App 与键盘两种形态**下都渲染（主 App 的登录门槛见 needLogin / openKbLogin），
     所以绑定放在 bind() 里两处共用，不能只挂在某一形态的渲染路径上。 */
  function bindKbLoginInputs() {
    document.querySelectorAll('.kb-login input[id]').forEach(node=>{
      const sync=()=>{
        if(node.id==='kb-login-consent'){state.kbLoginConsent=node.checked;return;}
        const was=kbLoginReady();
        if(node.id==='kb-login-phone')state.kbLoginPhone=node.value;else state.kbLoginCode=node.value;
        if(was!==kbLoginReady())render();
      };
      node.addEventListener('input',sync);
      node.addEventListener('change',sync);
    });
  }
  /* 「切换到 LoveCo 键盘」页（结构见 appGuideSwitch）的两处指针交互：
     ① **地球**：长按 350ms 弹出键盘选择器（真机长按地球就是这个弹窗）；短按也给同一个出口
        （宽容处理 —— 真机上短按是切下一个键盘，原型里给同一个出口，免得点了没反应）。
        长按的定时器在 pointerup / 离开 / 取消时清掉；长按弹出后紧接着那次 click 丢弃（fired），
        免得同一按弹两次（浮层打开时整页重渲染，节点已换，通常也收不到那次 click）。
        节点上不挂 data-action（上面那轮通用绑定不接它），开关全在这里。
     ② **输入框保持激活**：点页面上任何一处（键盘选择器那一层与地球除外）都把焦点还给
        #kb-switch-input —— 这一页的输入框是「默认激活」的（见 renderApp 里的首帧聚焦），
        点别处也不该让它看起来失活。
     bind() 在每个形态的每次渲染后都会调它；不在这一页时选择器查不到节点，整段空跑。 */
  function bindKbSwitchPage() {
    const globe = $('.kbsw-globe');
    if (globe) {
      let timer = null, fired = false;
      const cancel = () => { clearTimeout(timer); timer = null; };
      globe.addEventListener('pointerdown', (e) => {
        if (e.button) return;
        e.preventDefault();
        fired = false;
        timer = setTimeout(() => { timer = null; fired = true; openKbSwitchPicker(); }, 350);
      });
      ['pointerup','pointerleave','pointercancel'].forEach(ev => globe.addEventListener(ev, cancel));
      globe.addEventListener('click', () => { if (fired) { fired = false; return; } openKbSwitchPicker(); });
    }
    const page = $('.kbsw-page');
    if (page) page.addEventListener('click', (e) => {
      if (e.target.closest('.kbsw-picker-layer') || e.target.closest('.kbsw-globe')) return;
      const input = $('#kb-switch-input');
      if (input && document.activeElement !== input) input.focus({preventScroll:true});
    });
  }
  function bind() {
    document.querySelectorAll('[data-action]').forEach(node=>node.addEventListener('click',()=>action(node.dataset.action)));
    /* 首页「限时特惠」悬浮卡的拖动与点击（它不挂 data-action，见 bindOfferBadge） */
    bindOfferBadge();
    bindKbLoginInputs();
    bindKbSwitchPage();
    /* 出生日期滚轮的两处挂点（不在这一页 / 这一层时查不到列，各自空跑）：
       「你的出生日期」页（资料引导第二步）与「用户」页的出生日期弹层 */
    bindWheelCols('.onb-page','onboardPick','#onb-meta',onboardMetaText);
    bindWheelCols('.user-wheel','userPick','#user-meta',userMetaText);
    /* 按住说话（语音入口全部改为 pointer 按住，不再有点击弹层）：
       pointerdown 即开始「录音」（遮罩由 render 输出），preventDefault 压掉文本选择 / 拖拽；
       后续 move / up 由 window 级监听接管（见 beginVoiceHold），按钮上不挂任何 click 动作。
       顺带把入口名（data-voice-hold：panel / composer / dictation）交给按住态 ——
       面板那颗、以及面板停在已完成态时按下的任何一颗，松手后都是「语音追问」
       （转写当输入重新生成，见 chatPanelDone），其余入口写进宿主输入框。
       touch-action:none 关掉浏览器把竖向位移当滚动的处理，否则上滑取消会先滚走页面。 */
    document.querySelectorAll('[data-voice-hold]').forEach(node=>node.addEventListener('pointerdown',e=>{
      if(e.button)return;
      e.preventDefault();
      beginVoiceHold(e,node.dataset.voiceHold);
    }));
    /* 聊天对象行的左滑操作（结构见 partner-manager / partners 弹层）：
       编辑 / 删除停在行外右侧，向左拖时滑入、盖在行内容之上 —— 行内容固定不动，
       头像与名称始终可见（键盘面板窄：内容整行左移会被按钮组推出可视区）。
       pointer 事件统一鼠标与触屏，横向意图（|dx|≥8 且大于 |dy|）锁定后才接管，
       touch-action:pan-y 保住列表的纵向滚动；吸合判定：松手时位移过半展开、否则弹回。
       拖过的那一下与点已展开行的内容区，都在捕获阶段拦掉 click —— 拖动不误触「进详情」，
       再点一下只收起操作（点操作按钮不受影响）。
       按钮的 visibility 跟 .revealed 走（theme.css）：未滑开时不画 —— 按钮占满整行
       padding box 而行内容只有内容高，短条目下按钮两端会露残影；拖动中按位移实时同步。 */
    document.querySelectorAll('.swipe-row').forEach(row=>{
      const actions=row.querySelector('.row-actions');
      if(!actions)return;
      let sx=0,sy=0,base=0,pid=null,hLock=false,moved=false,wasOpen=false;
      const width=()=>actions.offsetWidth;
      /* 收起位 / 展开位都由 CSS（.row-actions 的 translateX / .swipe-row.revealed）给出，
         这里只清掉拖动留下的内联 transform，让样式表接管吸合动画 */
      const reset=()=>{actions.style.transition='';actions.style.transform='';};
      const shut=()=>{reset();row.classList.remove('revealed');};
      const open=()=>{reset();row.classList.add('revealed');};
      row.addEventListener('pointerdown',e=>{
        if(e.button)return;
        sx=e.clientX;sy=e.clientY;base=row.classList.contains('revealed')?-width():0;pid=e.pointerId;hLock=false;moved=false;wasOpen=base<0;
      });
      row.addEventListener('pointermove',e=>{
        if(e.pointerId!==pid)return;
        const dx=e.clientX-sx,dy=e.clientY-sy;
        if(!hLock){
          if(Math.abs(dx)<8&&Math.abs(dy)<8)return;
          if(Math.abs(dx)<=Math.abs(dy)){pid=null;return;}
          hLock=true;try{row.setPointerCapture(e.pointerId);}catch(_){/* 捕获失败不影响拖动 */}
        }
        moved=true;
        const off=Math.max(-width(),Math.min(0,base+dx));
        /* off：0（收起）→ -width（全展开）；按钮组的位移与之相反：width（行外）→ 0 */
        actions.style.transition='none';
        actions.style.transform=`translateX(${width()+off}px)`;
        row.classList.toggle('revealed',off<0);
      });
      const release=e=>{
        if(e.pointerId!==pid)return;pid=null;
        if(!hLock)return;
        const dx=e.clientX-sx;
        Math.max(-width(),Math.min(0,base+dx))<=-width()/2?open():shut();
      };
      row.addEventListener('pointerup',release);
      row.addEventListener('pointercancel',release);
      row.addEventListener('click',e=>{
        if((!moved&&!wasOpen)||e.target.closest('.row-actions'))return;
        e.preventDefault();e.stopImmediatePropagation();
        if(!moved)shut();
        moved=false;
      },true);
    });
    /* 输入框的显示值里含未确认的组合串（见 displayText）：
       手动编辑（物理键盘 / 粘贴）时把组合串就地落定 —— 字母已经显示在框里，
       直接当作普通文本接受，不再等候选词；移动光标时把 DOM 位置换算回锚点。
       右边那组按钮（表情+更多 ↔ 发送）由渲染时是否有内容决定，物理键盘打字不会触发渲染，
       所以只在「空 ↔ 非空」翻转时补一次渲染，避免每敲一个字都整页重画。 */
    $('#host')?.addEventListener('input',e=>{
      const wasTyped = state.host.trim().length > 0;
      state.composition='';state.host=e.target.value;state.hostCaret=e.target.selectionStart;
      if(wasTyped !== (state.host.trim().length > 0))render();else paintComposeMirror();
    });
    $('#host')?.addEventListener('focus',()=>{if(!restoringFocus)paintComposeMirror();});
    /* 宿主输入框：收起态下这一下点击 = 唤起键盘（先把光标锚点落到点击处，再整页重建弹出键盘）；
       键盘已激活时不做别的事 —— 只更新光标锚点与下划线镜像（不重渲染、不动打字态）。 */
    $('#host')?.addEventListener('click',e=>{
      state.hostCaret=composeAnchor(e.target.selectionStart,'host');
      if(state.kbCollapsed)return expandKeyboard();
      paintComposeMirror();
    });
    /* 宿主聊天区域（消息区 / 会话头部，不含输入栏）：任何时候点一下都收起键盘 ——
       键盘侧正开着哪个页面（菜单栏 / 候选词栏 / 对象管理页 / 设置页 / 选图 / 扫描 / 分析 / 编辑面板）
       都一并清场；已经收起时不重渲染（幂等）。 */
    document.querySelectorAll('#chat, .wx-header').forEach(node=>node.addEventListener('click',collapseKeyboard));
    /* 长文本时框里会内部滚动：下划线那一层跟着滚，线不会停在原地（见 paintComposeMirror） */
    $('#host')?.addEventListener('scroll',paintComposeMirror);
    $('#host')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(state.composition)commitComposition();else sendHost();}});
    /* 问AI 页的提问输入框（#free-chat）：与宿主输入框同一套 ——
       手动编辑（物理键盘 / 粘贴）时把组合串就地落定并把文字存回 state.freeText，
       点击 / 移动光标时把 DOM 位置换算回光标锚点，长文本框内滚动时下划线跟着滚；
       内容多行长高（最多三行，见 paintFreeInputGrowth）；Enter 直接当「发送」
       （组合串非空时先上屏，见 sendFreeChat）。
       **点这个框还有一层意思**：图片选择器展开时点它就收起、回到键盘页（见 closeFreePicker）。
       按住呢？**只有图片选择器展开时**按住才转语音（pointerdown → startFreeVoiceWatch）：
       那时框下方是截图网格、框里没有光标，按住框就是自然的「要说话」手势。
       键区在下面时框里停着光标（键区打字的目标就是它），长按框留给编辑 / 选字、不进语音 ——
       语音改由输入行右端那颗语音按钮承担（data-voice-hold="free"，由下面的统一绑定接管）。 */
    $('#free-chat')?.addEventListener('input',e=>{
      state.composition='';state.freeText=e.target.value;state.freeCaret=e.target.selectionStart;
      paintComposeMirror();paintFreeInputGrowth();
    });
    $('#free-chat')?.addEventListener('click',e=>{
      state.freeCaret=composeAnchor(e.target.selectionStart,'free-chat');paintComposeMirror();
      /* 主 App「AI 咨询师」页：点输入框 = 调出「当前键盘」（LoveCo / 系统键盘，见 openAaiKeyboard；
         底部弹窗开着时这一下先收弹窗）—— 键盘形态的问AI 页仍是老习惯：点输入框收选择器 */
      if(state.appView==='app'&&state.appScreen==='app-ai'){openAaiKeyboard();return;}
      if(state.freePicker){state.freePicker=false;render();}
    });
    /* 主 App「AI 咨询师」页：点聊天记录区 = 收起调出的键盘 / 底部弹窗（点输入框以外收键盘，
       与豆包聊天页同一习惯；已经收干净时不重渲染、不抢输入框焦点） */
    $('#aai-thread')?.addEventListener('click',()=>{ if(closeAaiLayers())render(); });
    $('#free-chat')?.addEventListener('scroll',paintComposeMirror);
    $('#free-chat')?.addEventListener('pointerdown',e=>{if(state.freePicker)startFreeVoiceWatch(e);});
    $('#free-chat')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(state.composition)commitComposition();else sendFreeChat();}});
    document.querySelectorAll('[data-control="mock-block"]').forEach(n=>n.addEventListener('change',e=>{state.outcome=e.target.checked?'blocked':'success';render();}));
    /* 「模拟试用额度耗尽」开关（2026-10-06 起只在键盘形态渲染，见 simControls）：打开时清零积分 + 去掉会员（原值快照留存），关掉原样还原；
       开关与快照都随 persist() 落库，刷新后原位恢复；中途购买 / 兑换到账则由 pay / redeem 显式把它复位。
       生成的自然扣减扣到 1 即止（额度只会被这个开关清零，见 generate()）—— 开关关着时它永远不动。 */
    document.querySelectorAll('[data-control="mock-credits"]').forEach(n=>n.addEventListener('change',e=>{
      if(e.target.checked){
        state.creditsSnapshot={credits:state.credits,member:state.member,memberExpiry:state.memberExpiry};
        state.credits=0;state.member=false;state.creditsOut=true;
      }else{
        const prev=state.creditsSnapshot||{credits:28,member:false,memberExpiry:null};
        state.credits=prev.credits;state.member=prev.member;state.memberExpiry=prev.memberExpiry??null;state.creditsOut=false;state.creditsSnapshot=null;
      }
      persist();render();
    }));
    /* 「会员状态」四档下拉（2026-10-06 需求，取代 2026-10-05 那颗「永久会员」开关）：
       未开通 / 非订阅会员 / 订阅会员 / 永久会员 —— 整台设备的会员身份一次摆好，写入逻辑见
       setMemberTier（订阅会员取今天 +30 天；选到任何会员档顺带把「模拟试用额度耗尽」复位，
       与购买 / 兑换到账同一套口径）。落库随 member / memberExpiry 一起走，
       下拉选中档由 memberTier() 从会员态反推。 */
    document.querySelectorAll('[data-control="mock-member"]').forEach(n=>n.addEventListener('change',e=>{
      setMemberTier(e.target.value);
      persist();render();
    }));
    /* 原「永久会员」开关与「语音指令」下拉的监听已于 2026-10-06 一并删除，勿再补回 */
    document.querySelectorAll('[data-control="mock-login"]').forEach(n=>n.addEventListener('change',e=>{
      if(state.paymentBusy){render();return;}
      cancelAI(true);state.accountEpoch++;state.loggedIn=e.target.checked;state.results=[];persist();
      /* 主 App 形态（开关在主 App 左栏「模拟」组里 —— 右栏 APP STATE 与仿真控制台入口 2026-09-29 已删除）：
         登录态变化后不该停在错位的页面上 ——
         登出（关掉开关）落回首页，并按主 App 的状态检查链重查一遍（先完全访问、后登录，见 appEntryGuards 的
         后两环）；重新打开则收起这层登录层、页面原地重渲染（需要登录的子页自己会再拦），
         不借机插权限引导（那不是这次动作的后果）。
         引导流程期间不插层（那时还没走到这几环）。 */
      if(state.appView==='app'){
        state.modalData={};
        closeKbLogin();
        if(!state.loggedIn){
          state.appScreen='home';state.modal='home';
          if(state.appScreen==='kb-guide'){render();return;}
          if(checkKbEntry())return;
          render();return;
        }
        /* 性别还没设置（「模拟 › 已设置性别」关着）时，用这个开关直接置成已登录同样要过一遍资料引导
           （见 startOnboarding）；「首启引导」开着时无条件照走（首启链路的一站，见 clearFirstLaunch） */
        if(!state.genderSet||state.firstLaunch){startOnboarding();return;}
        render();return;
      }
      /* 键盘在屏时这就是一次「键盘上的前置检查」：先看完全访问、再看登录 —— 没权限弹引导层、
         未登录弹登录层；重新打开（且权限已开）则把两层收起、键盘恢复可用（见 checkKbEntry()） */
      if(state.appView==='keyboard'&&!state.kbCollapsed){closeKbLogin();closeKbFullAccess();if(checkKbEntry())return;return render();}
      render();
    }));
    /* 左栏「模拟 › 已设置性别」仿真开关（**仅主 App 形态渲染** —— 2026-09-29 需求：键盘形态左栏
       与「仿真控制台」弹层不再显示这一行；这里按 data-control 挂监听，DOM 里没有就不挂）：
       关 = 性别还没设置 → 下次登录成功接着走资料引导；开 = 已设置、登录直接回原处。
       只改状态、落库，不当场进引导 —— 生效时机在**下一次登录成功**那一刻
       （finishKbLogin / mock-login 的主 App 分支都读它；首启引导期间无条件走）。
       资料引导走完（或跳过出生日期）时它会自动置成开（见 finishOnboarding）。 */
    document.querySelectorAll('[data-control="mock-gender-set"]').forEach(n=>n.addEventListener('change',e=>{
      state.genderSet=e.target.checked;
      persist();
      render();
    }));
    /* 左栏「模拟 › 首启引导」开关（2026-10-06 需求，**两种 App形态都渲染** —— 键盘形态的
       「仿真控制台」弹层里也有这一行）：打开 = 一键摆成「刚装上 App、第一次打开」的新设备
       并让主 App 整页落「开启键盘」引导页（见 firstLaunchReset，它自己会渲染）；
       关掉 = 什么都不复位，只把开关落回 false。它模拟的是一个一次性场景：整条首启链路
       （键盘引导 → 登录 → 资料引导）走完、落到首页那一刻由 clearFirstLaunch 自动关上。 */
    document.querySelectorAll('[data-control="mock-first-launch"]').forEach(n=>n.addEventListener('change',e=>{
      if(!e.target.checked){state.firstLaunch=false;render();return;}
      firstLaunchReset();
    }));
    /* 左栏「设备权限」的开关：蜂窝网络（决定未登录时弹哪张登录页）/ 开启键盘（关掉整块键盘换占位）
       / 键盘完全访问（键盘唤起时的第一道检查；Android 默认开启，只在那里跳过检查） */
    $('#perm-cellular')?.addEventListener('change',e=>{state.permissions.cellular=e.target.checked;render();});
    $('#perm-kb-enabled')?.addEventListener('change',e=>{
      state.permissions.kbEnabled=e.target.checked;
      /* 键盘关掉 = 当前输入法不可能是 LoveCo，复位成系统默认；完全访问是键盘的权限，
         也一并复位（与系统设置里那颗「LoveCo 键盘 / 启用LoveCo」开关同一套联动，
         见 toggleGuideEnable —— 2026-09-28 修复：此前关掉键盘后「键盘完全访问」仍是开的）；
         开启时若两步已齐则直接完成引导；引导页上的键盘切换悬浮窗也随关键盘收起 */
      if(!state.permissions.kbEnabled){state.permissions.ime='system';state.permissions.keyboard=false;state.kbImeSwitch=false;}
      syncFullAccess();
      if(finishGuideIfDone())return;
      /* 打开 = 键盘刚被启用（等价于一次「键盘被唤起」）：键盘在屏时接着跑前置检查（先完全访问、
         后登录，见 checkKbEntry）—— 默认关的设定下这就是「启用键盘后」的正常入口；
         关掉 = 键盘不在屏，两层覆盖层（完全访问 / 登录）随之收起，不留看不见的残留状态 */
      closeKbLogin();closeKbFullAccess();
      if(state.permissions.kbEnabled&&state.appView==='keyboard'&&!state.kbCollapsed&&checkKbEntry())return;
      /* 主 App 形态同理（同一节控件两形态共用）：键盘刚被启用 = 主 App 的状态检查链刚过第一环，
         接着把后两环补完（完全访问 → 登录，见 appEntryGuards）；引导流程期间不插层 */
      if(state.permissions.kbEnabled&&state.appView==='app'&&state.appScreen!=='kb-guide'){if(appEntryGuards())return;}
      render();
    });
    $('#perm-kb-full')?.addEventListener('change',e=>{
      state.permissions.keyboard=e.target.checked;
      /* 键盘在屏时这就是一次「键盘上的前置检查」：关掉（= 没在系统设置里开完全访问）即弹引导层；
         重新打开则收起引导层、接着看登录状态（都满足才回键盘）—— 见 checkKbEntry() */
      if(state.appView==='keyboard'&&!state.kbCollapsed){closeKbLogin();closeKbFullAccess();if(checkKbEntry())return;}
      /* 主 App 形态（左栏「设备权限」两形态共用）：同样是「先权限、后登录」的一次重查 ——
         关掉即弹完全访问引导层（铺满主 App 正文区），重新打开则收起引导层、接着看登录状态；
         引导流程期间不插层（那时还没走到这一环，见 appEntryGuards） */
      if(state.appView==='app'&&state.appScreen!=='kb-guide'){closeKbLogin();closeKbFullAccess();if(checkKbEntry())return;}
      render();
    });
    /* 原「键盘设置」页的深色外观开关（#dark）随该页于 2026-09-26 删除：state.dark 与 .dark 皮肤
       保留（宿主会话有自己的深色、键盘皮肤仍会跟随 state.dark），但已无 UI 入口切换。
       原旧登录页 / 旧会员页的协议勾选监听（#login-consent / #purchase-consent）也随两页删除 ——
       登录层的勾选走 kb-login 组件自己的监听（#kb-login-consent），购买不再前置勾选 */
    $('#avatar-input')?.addEventListener('change',e=>{
      const file=e.target.files?.[0];
      e.target.value='';
      if(!file)return;
      if(!file.type.startsWith('image/')||file.size>5*1024*1024)return;
      const reader=new FileReader();
      reader.onload=()=>{
        const image=new Image();
        image.onload=()=>{
          const size=320, canvas=document.createElement('canvas'), context=canvas.getContext('2d');
          canvas.width=size;canvas.height=size;
          const side=Math.min(image.naturalWidth,image.naturalHeight);
          const sx=(image.naturalWidth-side)/2, sy=(image.naturalHeight-side)/2;
          context.drawImage(image,sx,sy,side,side,0,0,size,size);
          state.modalData.avatar=canvas.toDataURL('image/jpeg',0.82);
          render();
        };
        image.src=String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }
  /* 点已展开行之外的任意处，收起该行的滑动操作（行内手势在 bind()，全局收起只注册这一次） */
  document.addEventListener('pointerdown',e=>{
    document.querySelectorAll('.swipe-row.revealed').forEach(r=>{
      if(r.contains(e.target))return;
      const a=r.querySelector('.row-actions');
      if(a){a.style.transition='';a.style.transform='';}
      r.classList.remove('revealed');
    });
  });
  document.addEventListener('keydown',e=>{
    /* Esc：主 App 的协议正文整页（= 返回箭头，2026-10-04 起不再是覆盖层）/
       键盘协议正文页 / 主 App 登录页的协议弹框 / 完全访问引导层 /
       键盘内登录层压在最上层（后两层互斥），先关它们；其次聊天分析面板（生成中=取消本次生成），
       再轮到各覆盖层 */
    if(e.key==='Escape'){if(state.paymentBusy)return;
      /* 键盘使用引导（演示层）压在最上层：Esc 先收它（每一步只有高亮区域可点，Esc 是它的出口；
         从「切换到 LoveCo 键盘」页进来的那一次，收场 = 完成引导，见 closeKbUsageGuide） */
      if(state.kbGuideDemo){closeKbUsageGuide();return;}
      /* 主 App 的「开启键盘」引导是流程整页：Esc 不提供出口（引导流程只能走自己的返回 / 完成动作）——
         「切换到 LoveCo 键盘」页上的键盘选择器是这一页自己的浮层，Esc 先把这一层收掉 */
      if(state.appView==='app'&&state.appScreen==='kb-guide'){if(state.kbSwitchPicker){state.kbSwitchPicker=false;render();}return;}
      if(state.iosPaySheet){closeIosPaySheet();render();return;}
      /* 「永久会员立减优惠」挽留弹窗（state.pu2Offer，2026-10-06 需求）：它是最上层的一层
         （挂在购买页出口上）—— Esc = 弹窗右上角那枚 x：放弃优惠 + 一并退出购买页
         （回首页 / 回「我的」与购买页出口同口径，见 leaveOfferSheet） */
      if(state.pu2Offer){leaveOfferSheet();return;}
      /* 「会员购买页 · 新」的协议确认框（2026-10-06 晚些需求）：Esc 只收框、停在购买页 */
      if(state.pu2Ask){state.pu2Ask=false;render();return;}
      /* 「会员购买页 · 新」的「兑换码」半屏弹层（2026-10-06 需求）：Esc 只收弹层、停在购买页 ——
         必须排在下面那条整页出口（purchase2-copy → 回「我的」）之前：先收最上层的浮层、再退页面 */
      if(state.redeemSheet){state.redeemSheet=false;render();return;}
      /* 主 App 的协议正文是**整页**（2026-10-04 起，不再是覆盖层）：Esc = 返回箭头，
         回打开它的那一页（state.legalFrom） */
      if(state.appView==='app'&&state.appScreen==='legal'){legalBack();return;}
      /* 「问题反馈」也是**整页**（2026-10-04 起，不再是 sheet 卡片）：Esc = 返回箭头，回「我的」；
         「关于 LoveCo」（2026-10-04 晚些新增的整页）与「邀请有礼」（2026-10-05 新增的整页）
         同一条出口 */
      if(state.appView==='app'&&(state.appScreen==='feedback'||state.appScreen==='about'||state.appScreen==='invite')){openAppScreen('account');return;}
      /* **「会员购买页 · 新」**（purchase2-copy，2026-10-06 新增；左上角那枚圆形叉号 `p2-close`
                    与 Esc 同一条出口 —— 第二个购买页 purchase2 2026-10-06 已按需求整页删除）：
                   **2026-10-06 需求：命中弹窗条件时这条出口先弹「永久会员立减优惠」挽留弹窗**
                   （leavePurchasePage —— **首启引导必弹、其余随机 1/4 命中才弹、当天已弹过一律不弹**；
                    没弹时**自动弹出的那一次（pu2Launch）回首页**、手动入口进本页的回「我的」） */
      if(state.appView==='app'&&state.appScreen==='purchase2-copy'){leavePurchasePage();return;}
      /* 「消息」整页（2026-10-05 需求）：Esc = 返回箭头，回首页 */
      if(state.appView==='app'&&state.appScreen==='messages'){openAppScreen('home');return;}
      /* 主 App「AI 咨询师」页（2026-10-06 需求）：Esc 按层退 —— 先收历史抽屉，再收底部弹窗 /
         调出的键盘（closeAaiLayers），最后才退页面（回首页，与顶栏 X 同一条出口；
         键盘问AI输入层随页面收起，见 dismissFreeChat） */
      if(state.appView==='app'&&state.appScreen==='app-ai'){
        if(state.aiHistoryOpen){state.aiHistoryOpen=false;render();return;}
        if(closeAaiLayers()){render();return;}
        dismissFreeChat();openAppScreen('home');return;
      }
      if(state.userSheet){state.userSheet='';render();return;}if(state.cancelAsk){state.cancelAsk=false;render();return;}if(state.supportSheet){state.supportSheet=false;render();return;}if(state.kbLegal){closeKbLegal();render();return;}if(state.kbConsentAsk){closeKbConsentAsk();render();return;}if(state.kbLogin){if(state.appView==='app'&&(state.appScreen==='login'||state.appScreen==='login-one-tap'))closeAppLogin();else closeKbLogin();render();return;}if(state.kbFullAccess){closeKbFullAccess();render();return;}if(state.kbPaywall){closeKbPaywall();render();return;}if(state.modal)closeModal();else if(state.chatPanel)closeChatAnalysis();else if(state.scanPanel)finishScan();else if(state.photoPanel)closePhotoPanel();else if(state.settingsPanel){state.settingsPanel=false;render();}else if(state.kbEditor){closeKbEditor();render();}else if(state.partnerPanel){state.partnerPanel=false;render();}else if(state.freePicker){closeFreePicker();}else if(state.freeChat){closeFreeChat();}else if(state.pending)cancelAI();return;}
    if(e.key==='Tab'&&state.modal){
      const nodes=[...document.querySelectorAll('.sheet button:not(:disabled),.sheet input,.sheet textarea,.sheet select,.sheet a[href]')].filter(n=>n.offsetParent!==null);
      if(!nodes.length)return;const first=nodes[0],last=nodes.at(-1);
      if(e.shiftKey&&(document.activeElement===first||!$('.sheet').contains(document.activeElement))){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&(document.activeElement===last||!$('.sheet').contains(document.activeElement))){e.preventDefault();first.focus();}
    }
  });
  window.addEventListener('beforeunload',()=>{abortVoiceHold();});
  /* 窗口尺寸变化会改手机高度（--lc-keyboard-panel-height / 消息区都在换算范围内）：
     引导层的遮罩还开着时重新对一次高亮框 */
  window.addEventListener('resize', () => { if (state.kbGuideDemo) paintKbUsageGuide(); });
  /* 启动即检查：键盘模式下键盘默认常驻（等价于刚被唤起），按同一套顺序 —— 先完全访问权限、
     后登录状态（没权限弹引导层；权限已开又未登录才弹登录层）。
     这里直接置状态、不置 pickerEnter —— 首屏不需要重放一次上滑动画。
     「开启键盘」默认关（2026-09-28 需求）时键盘不在屏（kb-off 占位），这两层不预置 ——
     进了也是看不见的残留，等打开「开启键盘」那一刻由它的 change 重跑一遍检查。 */
  if(state.appView==='keyboard' && state.permissions.kbEnabled){
    if(needsFullAccess())state.kbFullAccess=true;
    else if(!state.loggedIn){state.kbLogin=kbLoginMode();resetKbLoginForm();}
  }
  render();
})();
