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
  /* 默认头像插画来自 assets/avatars.js（JPEG data URI），缺失时 avatar() 自动退回首字兜底 */
  const AV = window.LOVECO_AVATARS || {};
  /* 宿主 App（微信）固定聊天模板：第三方 App 的会话不随键盘侧切换聊天对象而变 ——
     切对象只影响 LoveCo 键盘的上下文与生成；会话的备注名 / 头像 / 种子消息永远演同一套
     （host-app 头部、chat-area 对方头像、会话菜单「当前会话」都读这里） */
  const HOST_CHAT = { name:'林间', color:'coral', avatar:AV.p1||'' };
  const initialPartners = [
    {id:'p1',name:'林间',gender:'女',stage:'暧昧',note:'喜欢周末散步、独立书店和不太甜的咖啡。',color:'coral',avatar:AV.p1||''},
    {id:'p2',name:'陈一',gender:'男',stage:'熟悉',note:'最近在筹备摄影展，喜欢轻松直接的聊天。',color:'blue',avatar:AV.p2||''},
    {id:'p3',name:'小满',gender:'暂不设置',stage:'初识',note:'负责产品设计，工作沟通以清楚、友好为主。',color:'',avatar:AV.p3||''}
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
  /* 「模拟额度耗尽」的**开关状态与快照**也要跟着本地恢复（原来只存了被清零的积分）：
     只存积分不存开关，刷新后开关显示为关、积分却是 0 —— 一发起生成就弹「会员与积分」，
     看着像开关失灵。顺带兜一条旧数据：开关关着而积分 < 1（旧版本留下的脏值）时回到初始额度。 */
  const creditsOut = saved.creditsOut === true;
  const savedCredits = Number.isFinite(saved.credits) ? saved.credits : 28;
  /* App形态：app = LoveCo 主 App 界面，keyboard = 宿主 App 内唤起的 LoveCo 键盘。 */
  const surfaceParam = ['app','keyboard'].includes(route.get('surface')) ? route.get('surface') : '';
  /* 重渲染把焦点还给 #host 时的标记：这类 focus 不是用户主动聚焦，只是渲染后的还原。 */
  let restoringFocus = false;
  const state = {
    platform: ['harmony','android','ios'].includes(route.get('platform')) ? route.get('platform') : saved.platform || 'harmony', typing:false,
    dark: saved.dark || false, layout: saved.layout || 'qwerty', language:'zh', layer:'letters', shift:false, symbolCat:'常用',
    /* draft 是 AI 请求的输入文本（截图转写 / 最近一条种子消息），只在页面内存里，不再有输入框 */
    composition:'', t9Path:0, host:'', hostCaret:0, draft:'今天有点累，感觉什么都没做好。',
    /* 登录状态默认关（2026-09-28 需求：左栏「设备权限」「模拟」里的开关默认都是关的）——
       未登录启动时键盘被唤起先弹登录层、主 App 落首页前弹登录层；老存档里的登录态照旧恢复 */
    loggedIn:saved.loggedIn === true, phone:'138****8000', nickname:saved.nickname || '小周',
    credits: creditsOut || savedCredits > 0 ? savedCredits : 28, member:saved.member || false,
    /* L+ 会员到期时间戳：0 = 永久（键盘内「永久会员」档），正数 = 到期时刻，
       null = 老存档（只知道自己开了会员、不知道何时到期）——「我的」的会员标识行
       只在有值时才打出到期日，不给老数据硬编一个假日期。 */
    memberExpiry: Number.isFinite(saved.memberExpiry) ? saved.memberExpiry : null,
    /* 旧 localStorage 数据的默认对象（p1–p3）没有头像字段，补上插画；用户自传或已清空的不覆盖 */
    partners: Array.isArray(saved.partners)
      ? saved.partners.map(p=>({...p, avatar:p.avatar || AV[p.id] || '', stage:normalizeStage(p.stage)}))
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
    /* 「模拟额度耗尽」是开关：打开时把积分清零并去掉会员标识，原值存进 creditsSnapshot，关掉即还原。
       开关状态与快照都持久化（见上面的 creditsOut / savedCredits）：刷新后开关仍按原位显示、
       关掉时还原的是真实的原值，不会再出现「开关关着、额度却是 0」的错位 */
    creditsOut, creditsSnapshot:saved.creditsSnapshot || null,
    /* kbEnabled = 左栏「设备权限」的「开启键盘」开关：关闭时键盘整块换成占位（宿主 App 用系统键盘）；
       主 App 的状态检查链里它是第一环（没启用整页进「开启键盘」引导，见 appEntryGuards）；
       keyboard = 「键盘完全访问」开关：键盘被唤起时先看它 —— 没开就从下往上弹「完全访问引导页」
       （kb-full-access，Android 默认开启、不弹），主 App 里它是状态检查链的第二环
       （键盘权限通过后再查它，见 appEntryGuards），另外仍是 generate() 的拦截判定；photos 三档 denied / limited / full ——
       消费方是键盘选择器（kb-photo-picker）：完整访问 = 正常网格，有限访问 = 顶部引导条 +
       只有授权过的那张可读，关闭 = 整块换成权限引导页；
       cellular = 「蜂窝网络」开关（开 = 视为已插卡且有蜂窝网络）—— 只有一个消费方：
       未登录时键盘内弹哪张登录页（一键登录 / 手机号验证登录，见 kbLoginMode）；
       ime = 「当前输入法」（'system' 系统默认输入法 / 'loveco' LoveCo 输入法，默认前者）——
       安卓引导页第二步的判定项：安卓系统不允许 App 直接切换输入法，键盘启用后还要用户在系统里
       把当前输入法切成 LoveCo（见 appGuideHome / guideSatisfied）；与「开启键盘」强绑定 ——
       选 LoveCo 必然已启用键盘（动作里顺带打开），关掉键盘则复位成系统默认 */
    /* 三个可见开关**默认都是关的**（2026-09-28 需求）：蜂窝网络 / 开启键盘 / 键盘完全访问 ——
       配上「模拟 › 登录状态」也默认关，启动即一台还没启用键盘、没授权访问、没登录的新设备，
       引导链路（键盘引导 → 完全访问引导 → 登录）从头走一遍；network 与 microphone 没有 UI 入口，
       是拦截判定（手改验证），保持默认开启 */
    permissions:{network:true,cellular:false,kbEnabled:false,keyboard:false,photos:'full',microphone:true,ime:'system'},
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
       这一栏**点一下立即发送**（pickFreeShortcut），所以它只在发送那一刻有用 ——
       决定这次的**结果结构**：「帮我回」→ 聊天分析（关系简报 + 三组建议）；
       其余 / 空 → AI通用回复（见 sendFreeChat / makeOutcome）。 */
    freeShortcut:'',
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
    /* —— 「模拟截屏」（左栏「模拟」的按钮 / 仿真控制台的同名按钮）：仿真按一下系统截屏键 ——
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
    appView:surfaceParam || 'keyboard', appScreen:null,
    /* 页面列表分组的展开集合：空 = 全部默认折叠（见 pageList），点组名才把该组加进来。
       只存「展开的组」，新增分组无需额外登记即自动落到默认折叠态。页面内存、不持久化。 */
    pageExpanded:{},
    /* 键盘收起态：点宿主聊天区域（消息区 / 会话头部，不含输入栏）即收走整块键盘 ——
       键盘的任何状态与页面（菜单栏 / 候选词栏、对象管理页 / 设置页、选图 / 扫描 / 分析面板、
       对象编辑面板）一并清场，手机里只剩宿主会话；再点宿主输入框才重新弹出（见 expandKeyboard）。
       收起 / 弹出都不动宿主输入框草稿（state.host）与会话消息 —— 收起的是键盘，不是用户打的字。
       不持久化：刷新页面回到「键盘常驻」的默认形态；切主 App / 返回键盘时由 returnKeyboard() 复位。 */
    kbCollapsed:false,
    /* 键盘内登录层（kb-login 组件）：键盘模式下未登录时，键盘一被唤起就弹出、覆盖整个键盘区域 ——
       kbLogin 记当前形态（'' = 不显示 / 'one-tap' 本机号一键登录 / 'sms' 手机号验证登录 /
       'done' 登录成功的提示，约 1 秒后自动收起），形态缺省按「设备权限 › 蜂窝网络」
       （permissions.cellular）二选一，见 kbLoginMode()；
       kbLoginPhone / kbLoginCode 是短信形态两张输入框的值（bind() 实时回存，重渲染不丢），
       kbLoginSent 记验证码已发送（按钮改「重新获取」）、kbLoginBusy 是发码请求在飞、
       kbLoginConsent 是一键登录的协议勾选、kbLoginTimer 是成功提示的收起定时器。
       除恒常驻的启动态外，都是打开时重置。 */
    kbLogin:'', kbLoginPhone:'', kbLoginCode:'', kbLoginSent:false, kbLoginBusy:false, kbLoginConsent:false, kbLoginTimer:null,
    /* 键盘内协议正文页（kb-legal 组件）：登录层协议行里点协议名打开 —— 把该协议全文缩到键盘
       这一条高度里滚动浏览（正文取 legal-data.js 同一份快照，见 kbLegalDoc）。
       kbLegal 记当前协议 key（'' = 不显示 / 'terms' 用户注册协议 / 'privacy' 用户隐私协议 /
       'carrier' 中国联通认证服务协议）；kbLegalEnter 是这一层「从下往上弹出」的一次性标记
       （单独一个，不复用 pickerEnter —— 免得连带把底下的登录层一起重播滑入动画）。
       它只是压在最上面的一页正文：X / Esc 关掉即回登录层、协议勾选状态不动；
       关闭登录层 / kbReset 时随登录层一并收起。 */
    kbLegal:'', kbLegalEnter:false,
    /* 键盘完全访问引导层（kb-full-access 组件）：键盘被唤起时的第一道检查 —— 键盘侧没有完全访问权限
       （iOS 叫「允许完全访问」、鸿蒙叫「完整访问」，Android 系统上默认开启）就弹出这一层，
       「去开启」仿真开启后才轮到登录检查（见 checkKbEntry）。主 App 里它同样是状态检查链的一环
       （键盘权限通过后再查它，见 appEntryGuards），渲染在 .app-shell 上、铺满正文区（组件按形态
       不渲染键盘底栏，见 kb-full-access.js）。kbFullAccess 只是这层覆盖层的开关（与 kbLogin 互斥），
       不持久化。 */
    kbFullAccess:false,
    /* 主 App 协议正文覆盖层（state.appLegal）：协议正文原是一个独立页面（/legal/:key），
       2026-09-26 按需求页面删除后降级成**浮在主 App 页面上的 sheet 覆盖层** —— 不占页面、
       不进 appScreens，协议入口（「我的」的四条直链 / 协议中心 / 登录页与会员页的协议链接）
       都只把它打开，关掉即回原页。协议 key 复用 state.legalKey（'user'/'member' 由动作层映射到
       legal-data.js 的 key）。 */
    appLegal:false,
    /* 主 App 启动闸门（state.appGate）：进入主 App 先发一次仿真网络请求检查联网状态 ——
       'checking' 检查中（整页「正在检查网络…」）/ 'nonet' 检查失败（整页网络不可用 + 重试）/
       '' 通过（接着走状态检查链：键盘权限 → 完全访问 → 登录，见 appEntryGuards）。页面内存、不持久化。 */
    appGate:'',
    /* 开启键盘引导（state.kbGuidePage）：启动闸门通过后键盘未开启（!permissions.kbEnabled）时，
       主 App 不落首页、整页进入引导流程 —— 'guide' 引导页（演示视频 + 一至两颗按钮：鸿蒙 / iOS
       一颗，安卓两颗，见 appGuideHome）/ 'settings' 模拟鸿蒙「输入法」设置页 / 'detail' LoveCo
       输入法详情页（两个开关）。kbGuideFull 是详情页「完整体验模式」开关的值（第一个开关
       「启用LoveCo」直接绑 permissions.kbEnabled —— 开了它左栏「开启键盘」同步打开，
       键盘就算开启了）。引导完成的条件按平台两分（见 guideSatisfied）：键盘已启用；
       安卓还要「当前输入法」已是 LoveCo（permissions.ime，左栏「设备权限」里可切）。
       页面内存、不持久化；完成引导 / 离开主 App 都清空。 */
    kbGuidePage:'', kbGuideFull:false,
    /* 会员开通覆盖层（kb-paywall 组件，主 App 与键盘形态共用同一层）：kbPaywall 是这层覆盖层的
       开关，kbPlan 是它选中的档位（默认永久会员）。商品只有一张表（PLANS，见下）——
       原「键盘内 / 主 App 各一套商品、靠 planSource 分流」的做法已随主 App 会员页删除作废。 */
    kbPaywall:false, kbPlan:'permanent',
    paymentBusy:false,
    /* 按住说话（state.voiceHold）：{cancel, y0, pid, source} —— source 记按住的是哪个入口
       （'panel' 聊天分析面板的麦克风 / 'composer' 输入栏语音圆钮与框内麦克风 / 'dictation' iOS 底栏）。
       松手去向两分：面板麦克风，或面板正停在已完成态（「聊天分析 · 已完成」/「AI通用回复」两页，
       见 chatPanelDone）—— 转写文本是**给 AI 的一句新指令**，作为本次输入重新生成
       （过渡页 → 生成中 → AI通用回复，见 submitPanelVoice）；其余时候写进宿主输入框；
       voiceQuery 是左栏「模拟 › 语音指令」里选的那句话（只有一档：文案与结果结构都按它来，
       见 VOICE_QUERIES / makeOutcome），与真实产品一致的是「AI 按用户说了什么决定结果长什么样」。 */
    voiceHold:null, voiceQuery:'review', legalKey:'terms',
    requestSeq:0,
    accountEpoch:0, gender:saved.gender||'暂不设置', age:saved.age||'暂不设置', mutationBusy:false, formCache:{},
  };
  /* ?surface=app 直接进入主 App 形态。进入不再直接落首页：先走一遍启动闸门
     appEntryCheck() —— 仿真网络请求检查联网状态，通过后再查键盘是否开启；
     键盘未开启就整页进「开启键盘」引导（不弹登录层），都通过才落首页（未登录补弹登录层）。
     先把闸门摆成「检查中」让首帧就停在这，真正发请求放定时器里：
     启动脚本还没跑完（后面还有 const），同步调用 render 会踩 TDZ。 */
  if (state.appView === 'app') {
    state.appGate = 'checking';
    setTimeout(appEntryCheck, 0);
  }
  /* 会员商品表：主 App 的会员开通覆盖层与键盘内付费引导**共用同一张**（两处同一套设计、
     同一份档位，不再各卖各的）—— 永久 / 周 / 季度三档，都带划线原价与按钮角标（badge）。
     days = 购买成功后按它算出 state.memberExpiry（「我的」显示到期日），永久档 0 = 永久。
     2026-09-26 起主 App 不再单独维护「月度 / 年度 / 100 积分」那张表（原 plans 随
     「会员与积分」整页一并删除；积分档就此不再存在）。 */
  const PLANS = {
    permanent:{name:'永久会员',price:'128',origin:'576',detail:'永久 AI 权益',kind:'member',days:0,badge:'一次性买断'},
    week:{name:'周会员',price:'9.9',origin:'48',detail:'7 天 AI 权益',kind:'member',days:7,badge:'畅享 7 天'},
    quarter:{name:'季度会员',price:'98',origin:'128',detail:'90 天 AI 权益',kind:'member',days:90,badge:'畅享 90 天'},
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
        /* 「模拟额度耗尽」的开关状态与快照一起落库：积分与开关始终成对（见 state 顶部注释） */
        creditsOut:state.creditsOut,creditsSnapshot:state.creditsSnapshot,
        partners:state.partners,gender:state.gender,age:state.age}));
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
  function partnerAvatar(p=person()) { return avatar(p?.name||'无',p?.color,p?.avatar); }
  /* 「我」的头像：微信聊天页右侧行与账户页共用同一张插画（AV.self），缺失时退回首字 */
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
     框长高（以及选中图片后多出的缩略图行 / 快捷栏）会把整块键盘一起往上顶：多出来的实际高度
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
    /* 这一块本来就该高的两行：标题行（或打字时的候选词栏，都是 --lc-toolbar-height，
       顶替菜单栏、不额外占高）与提问输入行（--lc-free-row-height）—— 多出来的才算加高 */
    const scope = getComputedStyle(keyboard);
    const base = (parseFloat(scope.getPropertyValue('--lc-free-row-height')) || 44)
      + (parseFloat(scope.getPropertyValue('--lc-toolbar-height')) || 40);
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
    return { platform: state.platform, state, esc, icon, ib, primary, avatar, noneAvatar, person, personName, partnerAvatar, selfAvatar, hostChat: HOST_CHAT, displayText, partnerNameDisplay, freeChatDisplay, enterKeyLabel, targetContext, freeShortcuts: FREE_SHORTCUTS, kbLoginReady, photos: photoItems, avatars: avatarItems, shot, shotThumb: shotThumbImage, pendingShot: pendingShotItem, kbLegal: kbLegalDoc, plans: PLANS, stages, defaultStage: DEFAULT_STAGE, md: mdHtml };
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
     desc 就是这个「页面功能与设计」：既要说清这个页面能做什么（功能），也要写清它长什么样、怎么排布、视觉与交互的设计取舍。 */
  const KB_PAGES = [
    {id:'host-chat',group:'宿主会话与菜单栏',name:'宿主会话（微信）',route:'宿主 App › 会话界面',trigger:'在聊天类宿主 App 中唤起 LoveCo 键盘即显示（键盘侧的前置检查先跑：没有完全访问权限先弹「键盘完全访问引导页」，权限已开又未登录再弹「键盘内登录页」，都在「键盘权限与登录」组；两层都通过才看到底座键盘）；关闭键盘上的覆盖层 / 退出打字后回到这里；点消息区 / 会话头部收起键盘（见「宿主会话 · 键盘收起」），收起后点输入框唤回',desc:'微信风格的宿主聊天界面：头部（居中备注名）、消息区、输入栏，LoveCo 键盘占下半屏；点消息区 / 头部即收起键盘（键盘的任何状态与页面一并清场），收起后点输入框重新弹出',note:'宿主会话是固定聊天模板（演「林间」），切换聊天对象不影响会话内容；头部的返回 / 会话菜单入口已按要求删除'},
    {id:'host-chat-collapsed',group:'宿主会话与菜单栏',name:'宿主会话 · 键盘收起',route:'宿主 App › 会话界面（键盘已收起）',trigger:'点宿主聊天区域（消息区 / 会话头部，不含输入栏）；键盘处在任何状态 / 页面时都生效',desc:'收起态：整块 LoveCo 键盘不渲染，由消息区与输入栏之间的一块「键盘让位区」（.wx-kb-space，高度 = 常规键盘高、会话底色 #111）顶上原来键盘占的那段 —— 消息区的高度与键盘在屏时完全一致、气泡列停原位不下移，只有输入栏被顶到屏幕底边（下方不再有键盘的浅色块）；手机里自上而下仍是顶部状态栏、会话头部（36px 居中备注名）、消息区、让位区、输入栏；点输入框（含框内麦克风以外的整块输入区）即把键盘唤回，唤回时落在干净底座（菜单栏 + 字母层，布局沿用设置里选的那套），光标交回输入框。功能上它是一次「全清」：无论键盘此刻是菜单栏 / 候选词栏 / 数字 · 符号层，还是开着对象管理页、键盘设置页、选图选择器、AI 分析过渡页、聊天分析面板、对象编辑面板，点聊天区域都一次性收走并清场（生成中的 AI 请求随之取消、未确认的拼音组合串丢弃、编辑面板先兜底落库）；已经收起时再点聊天区域不重渲染。宿主输入框草稿与会话消息不受影响 —— 收起的是键盘，不是用户打的字。**唤回键盘时会先跑一遍前置检查**：没有完全访问权限先弹「键盘完全访问引导页」，权限已开又未登录再弹键盘内登录层（见「键盘权限与登录」组），都通过才回到底座键盘',note:'与「宿主会话（微信）」是同一屏的两种形态（键盘在 / 键盘收起）；键盘已激活时点输入框不做任何操作（只更新光标锚点与下划线镜像）；进主 App 再返回、切运行平台、从页面列表点进任何键盘页面都会把键盘拉回常驻'},
    {id:'composer-empty',group:'宿主会话与菜单栏',name:'宿主输入栏 · 空态',route:'宿主 App › 会话输入栏',trigger:'宿主输入框没有内容时（默认状态）',desc:'左侧语音圆钮（按住说话）+ 输入框（框内麦克风同样是按住说话），右侧只有一个表情圆钮',note:'与「宿主输入栏 · 输入中」是同一输入栏（chat-composer）的两种形态'},
    {id:'composer-typing',group:'宿主会话与菜单栏',name:'宿主输入栏 · 输入中',route:'宿主 App › 会话输入栏',trigger:'输入框里有文字（键盘输入 / 语音转写写入 / 思路带入）',desc:'右侧表情圆钮换成蓝色的「发送」键，点击把输入框内容作为「我」的消息发进会话并清空输入框',note:'两种形态只差右侧按键；左侧语音圆钮与框内麦克风在两种状态下都在'},
    {id:'kb-toolbar-default',group:'宿主会话与菜单栏',name:'键盘菜单栏 · 未选择对象',route:'键盘 › 顶部菜单栏（第一状态）',trigger:'唤起键盘默认显示；或在聊天对象管理页选「不选择」后返回',desc:'左侧灰色用户图标 +「未选择」（点击进聊天对象管理页），右侧三个入口：问AI（气泡）、相册（键盘选择器）、键盘设置',note:'与「已选择对象」是同一组件（kb-toolbar）的两种形态'},
    {id:'kb-toolbar-partner',group:'宿主会话与菜单栏',name:'键盘菜单栏 · 已选择对象',route:'键盘 › 顶部菜单栏（第一状态）',trigger:'在聊天对象管理页选择任一对象后返回',desc:'左侧显示当前对象的圆形插画头像 + 备注名（点击回聊天对象管理页），右侧入口同上（问AI / 相册 / 键盘设置）',note:'头像即键盘侧上下文来源，切换对象只影响键盘侧的生成，不影响宿主会话'},
    {id:'kb-toolbar-shot',group:'宿主会话与菜单栏',name:'键盘菜单栏 · 待分析截图',route:'键盘 › 顶部菜单栏（截屏提示态）',trigger:'键盘收起 / 不在屏时点左栏「模拟 › 模拟截屏」（或仿真控制台里的同名按钮）产生一张截屏 —— 键盘当时感知不到这次截屏，截图先躺在相册里；随后把键盘唤起（点宿主输入框），**完全访问权限 → 登录状态 → 相册访问权限 = 完整访问** 三关都通过后，菜单栏最右侧的相册图标就地换成这张截图的缩略图',desc:'菜单栏相册入口的第三种形态（前两种是「未选择对象」「已选择对象」）：键盘不在屏时截的图会在键盘回来时补一个入口 —— 相册图标**就地换成那张截图的缩略图**：一枚**方形真缩略图**（28×28，与旁边两枚图标同宽）—— 这张聊天截图由 canvas 画成位图后导出（core/kit.js 的 shotThumb，同一张只画一次），深色底 + 几条气泡，缩略图边缘裁切、文字不再溢出（不再用 DOM 拼 3:4 卡片），整枚图标**持续放大缩小**（1.1s 一个来回，scale 1 → 1.12 配一圈淡紫呼吸光环）一闪一闪地引导点击；点它**不再经过选图面板**（不点图片按钮、不选图、不点分析），直接进「AI 分析」过渡动画页，之后的链路与「立即分析」完全一样。功能上这是键盘**感知截屏事件**的落点：键盘在屏时截屏根本不用提示 —— 那一下就自动进分析链路（「模拟截屏」的另一条分支）；只有键盘不在屏时，这次截屏才需要等键盘回来补一个入口。点掉它、再截一张，或从页面列表跳转，即回到普通相册图标；截图本身留在相册里，打开选择器仍可照常选用',note:'三关任一没过都不露脸（菜单栏仍是普通相册图标：没完全访问权限先弹引导页、未登录先弹登录页、相册不是完整访问则点图标走权限引导形态），条件补齐后同一张图自动露脸；提示位同一时刻只有一张（再截以最新那张为准），截图与提示都只在页面内存里（刷新 / 重置即清）。本条目点入 = 现场补一张「刚刚的截图」并把三关置成通过（键盘完全访问开、已登录、相册完整访问），停在提示态便于查看 —— 点缩略图即真实走一遍 AI 分析链路'},
    {id:'kb-candidates',group:'宿主会话与菜单栏',name:'候选词栏 · 打字中',route:'键盘 › 顶部菜单栏（第二状态）',trigger:'中文键盘键区按任意字母 / 数字键进入打字态',desc:'一行候选词 + 最右侧 X（退回菜单栏）；未确认的拼音带下划线显示在宿主聊天输入框里（问AI 页 / 对象编辑面板打开时则显示在各自的输入框里），点候选词 / 空格 / 回车替换那句字母；联想词按当前输入目标光标前的文字算',note:'英文键盘、数字层、符号层按键直接上屏，不进入打字态'},
    /* 问AI 页（kb-free-chat 组件）：键盘菜单栏气泡按钮进入的「与 AI 对话」页面 —— 标题栏 + 输入区 + 键区；
       下两条是它的两种形态（展开图片选择器 / 按住输入框说话） */
    {id:'kb-free-chat',group:'宿主会话与菜单栏',name:'问AI（与AI对话的页面）',route:'键盘 › 键盘顶部（问AI 页）',trigger:'键盘菜单栏相册（图片）图标**左侧的气泡按钮**（data-action="free-chat"）；或从本列表点入（现场停在默认样式上：提问框留空、没有附图）',desc:'键盘里直接问 AI 的页面（标题就叫「问AI」），键盘顶部换成「标题栏 + 输入区」、键区照常在下（键区布局 / 层 / 中英与进入前一致）。① **标题栏**（高度 = 菜单栏 --lc-toolbar-height）—— 左侧 15px 加粗「问AI」、右侧一枚圆形 X（收起这一页回干净键盘页，与 Esc 同一条出口）；②③④ **输入区**（自上而下：缩略图行 / 快捷栏 / 提问输入行，②③ 只在选中过图片时出现 —— 这一页默认就是「标题栏 + 输入行」两行；②与③、③与④ 之间各有一条**分隔线**（整行铺满））；② **缩略图行**—— 已选截图最多 3 张（46px 圆角卡片、与下方网格同一份选择，左上角压一枚半透明黑底 X 提示「点一下移出」）+ 未满 3 张时的一枚「+」继续挑；③ **快捷栏**—— 一行预设问题「帮我回 / 这样回复如何 / 我最后一轮回复的如何」（文字**不带箭头符号**），**点一下立即发送**（点了就算发送，见下），窄机上三条放不下、这一行**可左右滑**（横向滚动，滚动条不出现在设计里）；④ **提问输入行**—— 左起当前聊天对象的圆形头像（32px，点击进聊天对象管理页）、中间白底圆角提问输入框（一行时 34px 高 / 圆角 8px / 13px 字 / 内边距 10px，**占位文案两态**：键区在下面时是「输入问题」、图片选择器展开时是「输入问题或按住说话」，内容超过一行自动长高、**最多三行**，再多框内滚动）、右端两枚按钮（自左向右：**语音**按钮 —— 按住即进「按住说话」；**图片**按钮 —— 图片选择器收起时是它，展开且已选图时换成蓝色圆形「发送」）。标题栏**顶替菜单栏**（同为 --lc-toolbar-height，不额外占高）；输入区涨出来的实际高度（缩略图行 + 快捷栏 + 输入框多出来的行）由 `.keyboard.free-chat` 的 --lc-free-extra 往上长，键区高度始终与平时一致（切进 / 切出这一页键区不跳）。**这一页打开时键区打字的目标就是那行提问输入框**：拼音字母带下划线落在框里、点候选词换成正文、删除键先删字母（与宿主输入框同一套输入法逻辑），光标锚点记在 state.freeCaret。**发送**（键区右下角那颗蓝键，或图片选择器展开时输入行右端那枚蓝色圆形**向上箭头**按钮，或快捷栏上任意一条短语 —— 后者点一下**立即发送**）把这次提问交给 AI：先「AI 分析过渡页」、再聊天分析面板的生成中，最后打字机输出结果；发送后这一页收起、输入与附图一并清空。**发起时点了哪条快捷栏短语决定结果结构**：点「帮我回」→ 聊天分析（draftKind = chat，关系简报 + 三组建议）；从蓝键 / 发送按钮 / 语音发的、以及其它那两条短语 → AI通用回复（draftKind = review，见「问AI · 图片选择器」一条）。点输入框是普通聚焦（放光标）；**按住不动 260ms 转成「按住说话」只在图片选择器展开时生效** —— 那时框下方是截图网格、框里没有光标，按住框就是「要说话」的手势；键区在下面时框里停着键盘的光标（键区打字的目标就是它），长按框留给编辑 / 选字，语音只能按右端那颗语音按钮（两种入口见「问AI · 按住说话」）。X / Esc 只收起这一页，提问内容留着（下次进来还在）；「设备权限 › 键盘完全访问」关着时发送与其它生成一样静默不执行',note:'AI 结果统一由聊天分析面板承接 —— 面板关闭即回干净键盘页；两种结果形态：点快捷栏「帮我回」→ 聊天分析（关系简报 + 三组建议，draftKind = chat），其余（其它短语、蓝键 / 发送按钮 / 语音发起）→ AI通用回复（不写分析正文的简报卡 + 卡内两段 markdown，draftKind = review）；附图时先走一遍上传仿真（/v1/uploads/complete），截图转写并入本次输入。打开这一页前会收起其它键盘层（管理页 / 设置页 / 选择器 / 分析面板 / 编辑面板），打字时这一页的标题栏那行换成候选词栏（见下一条）'},
    {id:'kb-free-chat-typing',group:'宿主会话与菜单栏',name:'问AI · 打字中',route:'键盘 › 键盘顶部（问AI 页 · 打字态）',trigger:'问AI 页里在键区按任意字母键（中文键盘）进入打字态',desc:'问AI 页的打字形态：**标题栏那一行换成候选词栏**（与平时打字完全一致，两者同为 --lc-toolbar-height，键盘高度不跳），**提问输入行保持可见** —— 候选词要落在它里面、提交时第几行都要看得见（选中过图片时缩略图行与快捷栏也还在）；未确认的拼音字母带下划线显示在提问输入框里（下划线由 .compose-mirror 画，见 paintComposeMirror），点候选词 / 空格 / 回车把字母替换成候选词；候选词 / 联想词按这句提问光标前的文字算（targetContext）。两个出口：候选词栏最右侧的 X，或把组合串删干净后退回「问AI」标题栏 —— 两种都仍是这一页（提问内容不丢）。键区右下角那颗蓝键在打字态也还是「发送」：组合串非空时按第一下先上屏、再按才发送（不丢拼音）',note:'与「问AI（与AI对话的页面）」是同一页（kb-free-chat 组件）的两个状态；英文键盘 / 数字层 / 符号层按键直接上屏，不进打字态、不出候选词栏（与平时一致）'},
    /* 问AI 页的选图态与按住态：同一页（kb-free-chat 组件）的另外两种形态，各占一条 */
    {id:'kb-free-picker',group:'宿主会话与菜单栏',name:'问AI · 图片选择器',route:'键盘 › 输入行下方（问AI 页 · 选图态）',trigger:'问AI 页里点提问输入行右端的图片按钮（data-action="free-picker"），或点缩略图行尾的「+」（free-picker-add：补选第 2 / 3 张时唯一的入口）；或从本列表点入（现场带 1 张附图，缩略图行与快捷栏随之出现）',desc:'问AI 页的选图形态 —— **不跳「选择聊天截图」整页**，输入行**下方**的键盘区域（键体 + 平台底栏）整个换成三列聊天截图网格：从底部往上滑出、盖住键区（`.free-picker`，超出后网格内滚动，一屏约两行半；底纹取键盘色，浅色外观下是浅底 + 深色聊天截图卡）。同时输入行上方多出两行：**缩略图行** —— 已选截图最多 3 张（与网格里选中的那张同源、读同一份 state.selectedPhotos），每张 46px 圆角、左上角压一枚半透明黑底 X 提示「点一下移出」（点整张即移出，复用选择器的 photo:<id> 动作），未满 3 张时跟一枚「+」继续挑；**快捷栏** —— 一行预设问题「帮我回 / 这样回复如何 / 我最后一轮回复的如何」（文字不带箭头符号，窄机上放不下可左右滑），**点一下立即发送**，点的那条决定结果结构：**「帮我回」→ 聊天分析**（关系简报 + 三组建议回复），**其余 → AI通用回复**。输入行右端那枚图片按钮此时换成**蓝色圆形「发送」（里面一枚白色向上箭头）**（free-send；未选图时仍是图片按钮）：按下把「输入的那句话 + 已选截图」一起交给 AI（带截图时先走一遍上传仿真，转写并入本次输入）→「AI 分析过渡页」→ 聊天分析面板生成中 → 打字机输出。相册权限两档引导照旧生效：有限访问只放出授权过的那张；完全没开时网格位置换成一行引导 +「去开启权限」',note:'出口：点提问输入框（回到键盘页，附图与那行文字还留着）、Esc（先收选择器，再按一次才收整页）、或直接发送（发送后附图一并清空）；再点一次图片按钮也收起（同一枚按钮的开 / 关，已选图时它已是「发送」）。缩略图行与网格是同一份状态：网格里点第 2 张，缩略图行就多第 2 张，最多 3 张'},
    {id:'kb-free-voice',group:'宿主会话与菜单栏',name:'问AI · 按住说话',route:'键盘 › 键盘区域（问AI 页 · 按住态）',trigger:'问AI 页里**按住提问输入行右端那颗语音按钮**（data-voice-hold="free"，按下即进按住态，两种状态下都可用）；或**按住提问输入框**不动 260ms（FREE_HOLD_MS，**只在图片选择器展开时**：那时框里没有光标；短按仍是普通聚焦 + 放光标，点框还会收起图片选择器）；或从本列表点入（现场：图片选择器展开 + 附图 1 张 + 快捷栏选中「帮我回」+ 按住态）',desc:'问AI 页的按住说话形态：输入框**下方**的那一块（键区，或正展开着的图片选择器网格）被蓝色毛玻璃遮罩整体盖住（`.voice-rec` 与键盘区域同高，上缘渐隐、与上方输入区自然融合），提示「松手发送，上滑取消」，一排蓝色波浪条起伏模拟收音 —— 与聊天分析面板的麦克风是同一条交互。手指上滑超过阈值（56px）整体变红、提示换「松手取消」（回落到阈值内恢复发送态）。**松手（未上滑）直接发送**：先走一遍仿真转写（/mock/speech/recognize），转写并入提问框里的文字，随即走 sendFreeChat —— 发送内容 = 文字（含转写）+ 已选截图，结果结构仍由快捷栏决定（「帮我回」→ 聊天分析，其余 / 未选 → AI通用回复），接着「AI 分析过渡页」→ 生成中 → 打字机输出，这一页收起',note:'两个入口的分工：**键区在下面**（键盘激活、框里停着光标）时语音只能按那颗语音按钮 —— 输入框占位此刻写「输入问题」（不再提「按住说话」），长按框留给编辑 / 选字；**图片选择器展开**时按住框与按按钮都行（占位写回「输入问题或按住说话」）。与「按住说话 · 语音转写」共用同一条遮罩与同一套上滑取消逻辑，区别只在入口与去向（面板麦克风 → 语音追问；问AI 页的这条 → 连同附图与快捷栏选择直接发送）；「设备权限 › 麦克风」关着时按住不响应。按住输入框与「点框收起图片选择器」互不打扰：短按照常聚焦 / 收起选择器，按住才转语音'},
    {id:'kb-full-access',group:'键盘权限与登录',name:'键盘完全访问引导页',route:'键盘 › 整页覆盖层（从下往上弹出 · 权限引导）',trigger:'键盘被唤起（点宿主输入框把收起的键盘唤回 / 启动即常驻（键盘已启用时）/ 左栏打开「开启键盘」/ 左栏关掉「键盘完全访问」/ 切到需要授权的平台）时，键盘侧没有完全访问权限 —— iOS 叫「允许完全访问」、鸿蒙叫「完整访问」，Android 系统上该权限默认开启、不弹这一层。它是键盘唤起的第一道检查，通过之后才轮到登录检查（见同组三条登录页）',desc:'键盘侧没有完全访问权限时的引导页，键盘一被唤起就立刻弹出：从下往上滑入、**盖住整个键盘区域**（菜单栏 / 键区 / 底栏一并盖住；键盘高度不额外变化，就是常规键盘那一块）。面板自上而下四段：① **顶条**（与键盘菜单栏同高）—— 底色与下方主体完全一致的浅灰白、**不显示任何文字**，只在最右侧放一枚圆形叉号（= 关掉这一层、回到键盘页，键盘继续可用）；② **标题**「开启[允许完全访问]，AI 帮你回复」（鸿蒙端按系统叫法写成「[完整访问]」）居中排在引导图上方；③ **引导图** —— 居中一张白色圆角卡片（柔和投影），卡片里是**两张设置操作引导图的轮播**（一轮 6 秒、每张约 3 秒，交叉淡入淡出 + 上下小幅位移，纯 CSS 动画）：第一张画系统设置列表（Siri / 搜索 / 通知 / 无线数据 / 键盘，逐行小图标 + 名称 + 右折角箭头），一枚红色箭头点着底部的「键盘」行（该行浅灰高亮）；第二张画键盘详情页（顶部「LoveCo 键盘」页名行 + 白卡里「LoveCo 键盘」开关开着、「允许完全访问」开关关着 + 一行灰字说明），红箭头旋转 90° 后点着那颗权限开关；卡片下面是蓝底白字的「去开启」按钮（34px 高、圆角 10px、左右各 20px 内边距）；④ **平台底栏**（kb-navbar，Android 不渲染，面板直接铺到屏幕底边）',note:'两张引导图在真机上是系统设置截图，这里按截图结构用 CSS 画出（不引位图，窄机上也清晰；鸿蒙端共用同一套图，只把权限名与列表行名按系统叫法换掉）。「去开启」= 仿真「去系统设置开启完全访问」（复用左栏同一条判定：把 permissions.keyboard 置成已开启），随后接着做登录检查 —— 未登录就顺势弹出键盘内登录页，都满足才回键盘；右上角叉号 = 关掉这一层、回到键盘页（权限仍未开 —— 收起键盘后下次唤起会再弹一次），Esc 与它同一条出口；点宿主聊天区域收起键盘也会一并收起它'},
    {id:'kb-login-one-tap',group:'键盘权限与登录',name:'键盘内登录 · 本机号一键登录',route:'键盘 › 整页覆盖层（从下往上弹出）',trigger:'键盘被唤起的**前置检查走到第二环**（点宿主输入框把收起的键盘唤回 / 启动即常驻 / 左栏关掉「登录状态」开关）：完全访问权限已开（没开的话先弹「键盘完全访问引导页」）且未登录，并且「设备权限 › 蜂窝网络」打开（视为已插卡且有蜂窝网络）',desc:'未登录时的登录页，键盘一被唤起就立刻弹出：从下往上滑入、覆盖整个键盘 UI 区域（菜单栏 / 键区 / 底栏一并盖住），**高度与键盘保持一致**（常规 250px，不额外拉高整块键盘；内部按这条横带重排 —— 按钮 / 输入框取紧凑档，协议行沉到最下）。皮肤固定浅色：顶部一层淡粉紫渐变向下渐隐到白；**顶部一条键盘菜单栏那么高的「X 顶条」**（高度取 --lc-toolbar-height：常规 40px、矮窗口 210px 档 27px），X 靠右独占这一行、关闭本次登录（键盘恢复可用）—— 本机号 / 主按钮 / 「手机号登录」入口 / 协议行整体跟着往下移这一行（本机号不再自己留上边距）；顶条下是居中的大号本机号（号码旁不标「上次登录」）；下方整宽蓝色胶囊主按钮「本机号一键登录」（带同色柔光投影）—— **未勾选协议时点它不静默无反应，而是让底部协议行左右抖一下**（提示先勾选：只抖一次、颜色不变、也不弹任何提示条）；再往下居中的「手机号登录」圆角方块入口（**38px 见方 / 圆角 11px** 的浅灰底，矮窗口 33px；深色描边手机图形 + 灰色小字，点它切到手机号验证登录形态）；底部一行协议勾选（圆形勾选框 + 十一号灰字，协议名是同一层里可点的深色文字按钮 —— 点开键盘内协议正文页，见「键盘内登录 · 协议正文」）。勾选后点主按钮即模拟登录成功，先弹出「登录成功」提示、约 1 秒后收起登录层回到键盘；点 X 则保持未登录（下次唤起键盘再弹一次）',note:'本机号取 state.phone（仿真「上次登录」号，默认 138****8000，号码旁不再显示「上次登录」小标），一键登录走 POST /v1/auth/one-tap/login 仿真接口（不调用运营商 SDK）；协议名可点开键盘内协议正文页（kb-legal）—— 与主 App 登录页的协议链接同一个数据源（legal-data.js）；设计图里的「登录 LOVEKEY · 添加聊天人设到键盘」标题、微信 / Apple 登录入口按要求不呈现'},
    {id:'kb-login-sms',group:'键盘权限与登录',name:'键盘内登录 · 手机号登录',route:'键盘 › 整页覆盖层（从下往上弹出）',trigger:'同上，但「设备权限 › 蜂窝网络」关闭（无卡 / 未开蜂窝网络）；或在一键登录页点「手机号登录」切过来（就地换表单，不重放滑入动画）',desc:'同一登录层的短信验证码形态（高度同样与键盘一致、从下往上滑入）：顶部同样的浅色渐变与右上角 X，左上第一行是**页名「手机号登录」**（小字，与 X 同排）；往下两张浅灰胶囊输入框（**46px 高 / 15px 字**，矮窗口档 41 / 14；页名与第一张框之间留一截空白、两张框整体比原先靠下）—— 「请输入手机号」（打开即预填仿真测试号 13800138000，可改）与「请输入验证码」（框内右侧嵌一颗白底紫字胶囊「获取验证码」，发送后变「重新获取」）；再往下整宽胶囊「登录」按钮 —— 手机号 / 验证码没填齐时是淡紫禁用态（设计图里就是这一档），填齐后变实色可点；**按钮下面是协议勾选行**（圆形勾选框 + 十一号灰字：我已阅读并同意用户注册协议、用户隐私协议，不带运营商认证协议；两份协议名同样可点开键盘内协议正文页）。未勾选协议时点「登录」**不静默无反应，而是让协议行左右抖一下**（与一键登录同一套提示）；勾选后点登录即模拟成功 —— 先弹「登录成功」提示、约 1 秒后收起登录层回键盘，号码随之成为本机号',note:'仿真约定与主 App 登录页一致：点「获取验证码」走 POST /v1/auth/sms/send，发码后自动把验证码填成 123456（省一次手输），登录走 POST /v1/auth/sms/login；格式不对 / 验证码错误时点「登录」无反应（没有任何提示 —— toast 已整体删除）。协议勾选与一键登录共用同一份状态（在一键登录页勾过，切过来也是勾上的）。设计图里的「收不到验证码？联系客服」一行按要求不呈现'},
    {id:'kb-login-done',group:'键盘权限与登录',name:'键盘内登录 · 登录成功',route:'键盘 › 整页覆盖层（登录成功的提示）',trigger:'一键登录 / 手机号验证登录成功后的约 1 秒内（本列表点入为静态查看，不设收起定时器）',desc:'登录层的收尾形态：整条键盘高度的浅色底（同一块淡粉紫渐变）上只剩居中的一枚强调色圆勾 + 「登录成功」（15px 深色字），对勾带一记轻微放大淡入（0.28s）；提示停留约 1 秒后由 app.js 收起登录层、回到键盘页面（此刻状态已变成已登录）。它不是全局轻提示 —— toast 组件早已整体删除，这一记提示只是登录层自己的第三个形态，仍然只占键盘那一条',note:'停留时长是 app.js 的 KB_LOGIN_DONE_MS（1000ms），收起走 closeKbLogin()（连定时器一起摘）；期间按 Esc 或收起键盘也会立刻收掉'},
    {id:'kb-legal',group:'键盘权限与登录',name:'键盘内登录 · 协议正文',route:'键盘 › 整页覆盖层（协议正文 · 从下往上弹出）',trigger:'键盘内登录层的协议勾选行里点任一协议名（用户注册协议 / 用户隐私协议 / 中国联通认证服务协议）；或从页面列表本条目静态查看（按真实链路摆好一键登录层后再打开「用户注册协议」那份正文，X 一关即回登录层）',desc:'登录层协议名的落点：把主 App「协议中心」里那份协议全文**缩到键盘这一条高度里**滚动浏览 —— 仍是键盘那一块（常规 250px / 矮窗口 210px，不拉高键盘），从下往上滑入、压在登录层之上，配色与登录层同一套固定浅色（--kbl-*，不跟随键盘的浅色 / 深色外观）。结构自上而下两段：① **顶条**（键盘菜单栏那么高 --lc-toolbar-height：常规 40px / 矮窗口 27px）—— 左边一行小字协议名（13px / 矮窗口 12px，超长省略），右边一枚圆形 X；② **正文区** —— flex 吃满余高、**在键盘高度内纵向滚动**翻完全文（pre-wrap 保留分段，11.5px / 行高 1.8，矮窗口 10.5 / 1.75，深灰 #4C4D57）。三种形态按 state.kbLegal 换正文：用户注册协议 → LoveCo用户协议、用户隐私协议 → LoveCo隐私协议、中国联通认证服务协议 → 同名仿真文本（与主 App 协议中心同一个数据源 legal-data.js，逐字一致）。X / Esc 只关掉本页回登录层，协议勾选状态不动',note:'真机上运营商认证协议由运营商页面展示，这里就地看（该份为按真机场景补写的仿真文本，legal-data.js 里标 simulated；主 App「协议中心」也随之多出这一条，共 7 份）；协议正文页只为登录层的协议名服务 —— 收起键盘 / 关闭登录层（kbReset / closeKbLogin）时随登录层一并收起'},
    {id:'kb-zh-qwerty',group:'键盘布局',name:'26 键中文键盘',route:'键盘 › 按键区',trigger:'键盘设置页选「全键盘拼音」，或在英文键盘按「中/英」切回中文',desc:'三排字母 + 底行「123 / ，/ 空格 / 中英 / 发送」；键符恒为大写，输入进拼音组合',note:'与九宫格共用同一块键区，切换布局高度不跳'},
    {id:'kb-en-qwerty',group:'键盘布局',name:'26 键英文键盘',route:'键盘 › 按键区',trigger:'中文键盘底行按「中/英」切换',desc:'键位同 26 键中文但键符默认小写（按 ⇧ 变大写）、底行标点键为「.」；按键直接上屏，没有联想词',note:'英文键盘没有第二套布局，设置页选布局会直接切回所选的中文键盘'},
    {id:'kb-t9',group:'键盘布局',name:'中文九宫格键盘',route:'键盘 › 按键区',trigger:'键盘设置页选「九宫格拼音」，或在 26 键中文按地球键',desc:'左列五颗标点 + 3×3 字母块（只画字母不带数字）+ 右列 ⌫ / 换行 / 发送 + 底行「123 / 空格 / 中英」',note:'字母键按 T9 数字映射输入'},
    {id:'kb-t9-typing',group:'键盘布局',name:'九宫格 · 打字中',route:'键盘 › 按键区（打字态）',trigger:'九宫格按任意数字键进入',desc:'数字串推出拼音字母组合：左列换成拼音组合列、`@#` 变为分词键（插入分词符）、底行补「符号」键；顶部为候选词栏',note:'与候选词栏 · 打字中是同一状态的键区视角'},
    {id:'kb-numbers',group:'键盘布局',name:'数字键盘（123）',route:'键盘 › 按键区（数字层）',trigger:'字母层底行按「123」',desc:'左列五颗符号 + 3×3 数字 + 右列 ⌫ / 空格 / 发送 + 底行「返回 / 0 / .」；数字固定九宫格，与语言、布局无关',note:'按键直接插入字符，不进打字态'},
    {id:'kb-symbols',group:'键盘布局',name:'符号键盘',route:'键盘 › 按键区（符号层）',trigger:'九宫格 / 数字层左列末键「符号」，或九宫格 `@#` 键',desc:'左列四个分类（常用 / 中文 / 英文 / 表情）+ 右侧 4×4 符号面板（1px 网格线分隔）+ 底行「返回 / ，/ 空格 / 中英 / 发送」',note:'分类只换右侧 16 个符号，仅存在于当前页面内存'},
    {id:'partner-manager',group:'聊天对象',name:'聊天对象管理页',route:'键盘 › 整页覆盖层',trigger:'键盘菜单栏左侧的头像按钮',desc:'覆盖整个键盘区域（不覆盖宿主输入栏）：首行「不选择」，其余为对象列表（**顺序按最近操作在前** —— 新建的对象排在列表最前，编辑过的对象保存后也从原位提到最前，其余对象保持原有相对顺序）；单击行即选中并退出，左滑时编辑 / 删除从行右侧滑入、盖在行内容上（头像与名称保持可见，删除不二次确认、也不弹提示 —— 行收起后直接从列表消失并落库，退出再进来不会恢复）',note:'新建 / 编辑在键盘模式下打开「聊天对象编辑面板」（kb-partner-editor，新增 / 编辑两种形态各占一条）；主 App 形态仍用弹层'},
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
    {id:'chat-voice-general',group:'聊天分析',name:'AI通用回复',route:'键盘 › 整页覆盖层（聊天分析面板）',trigger:'面板停在「聊天分析 · 已完成」/「AI通用回复」时按住任一语音入口（面板麦克风 / 输入栏语音圆钮 / 框内麦克风）说一句指令（左栏「模拟 › 语音指令」）松手后：转写 → AI 分析过渡页 → 生成完毕',desc:'语音追问后 AI 重新给出的回复 —— 用户对着麦克风补一句话，AI 按它重新生成：**整页只有一张关系简报卡（紫底）**，AI 回复与回复思路都并进卡内、按 markdown 排版（内容自带章节标题，不再有「AI 回复 / 回复思路」的固定小标题）；没有建议回复。这张卡**不写分析正文**（不再有一段独立的简报文字），卡内自上而下就是 markdown 的三节：**「整体评价」**（✅⚠️ 两条点评 + 解释段）→ 分隔线 → **「分析对话节点」**（左侧竖线的引用块摆出「你：… / 她：…」两句对话 + 分析段）→ **「优化建议」**（1/2/3 有序列表：轻撩款（推荐）/ 轻松幽默款 / 温柔稳妥款，每项名下缩进一行可直接发送的话）；底部三颗悬浮按钮常驻，「发送」默认灰底灰字不可点（宿主输入框有内容才亮）；打字机逐段挂载：整体评价 → 分析对话节点 → 优化建议',note:'markdown 渲染由 app.js 的 mdHtml() 完成 —— 认标题行、有序 / 无序列表（含项下缩进续行）、`> ` 引用块、`---` 分隔线、`**加粗**` 与 emoji，目前只有这一形态走它；卡内内容见 REVIEW_ANSWER / REVIEW_THINKING 两段 markdown 文案。这一页自身也是语音入口：再按一次麦克风（或输入栏语音圆钮 / 框内麦克风）仍走同一条链路，结果还是停在「AI通用回复」'},
    {id:'voice-hold',group:'语音输入',name:'按住说话 · 语音转写',route:'键盘 › 键盘区域上的蓝色毛玻璃遮罩',trigger:'按住聊天分析面板的麦克风按钮（或输入栏语音圆钮 / 框内麦克风、iOS 键盘底栏语音键）',desc:'按住即「录音」：浮出一块**与键盘区域同高**（与 .keyboard 同高、同贴底）的蓝色毛玻璃遮罩（自下而上渐隐、上缘与面板内容自然融合；键盘被面板 / 选择器撑到三分之二时整块面板都在遮罩里，干净键盘页正好罩住键盘本身），提示「松手发送，上滑取消」，一排蓝色波浪条起伏模拟收音；手指上滑超过阈值进入取消态（整体变红，见「按住说话 · 上滑取消」）',note:'松手（未上滑）都走 /mock/speech/recognize 仿真转写，去向按「说话时屏幕上停的是哪一页」分两种：**面板正停在已完成态**（「聊天分析 · 已完成」/「AI通用回复」两页）—— 面板麦克风 / 输入栏语音圆钮 / 框内麦克风都把这句话当作给 AI 的指令重新生成（AI 分析过渡页 → 生成中 → AI通用回复）；**干净键盘页 / 面板生成中**（含 iOS 底栏语音键）仍是把转写写进宿主聊天输入框。上滑后松手即取消。原「主 App 接力 · 语音」弹层已删除，本页替代它'},
    {id:'voice-hold-cancel',group:'语音输入',name:'按住说话 · 上滑取消',route:'键盘 › 键盘区域上的红色毛玻璃遮罩（取消态）',trigger:'按住说话时手指上滑超过阈值（56px）',desc:'同一遮罩的取消态：整体变红（波浪条与提示文字同步），提示从「松手发送，上滑取消」换成「松手取消」；此时松手直接收场，不转写、不写入任何内容',note:'与「按住说话 · 语音转写」是同一遮罩（.voice-rec 加 .cancel）的两种形态；上滑超过 56px 进入、回落到阈值内恢复发送态（就地切 class，波浪动画不重置）'},
    {id:'platform-ios',group:'系统外观',name:'平台外观 · iOS',route:'键盘 › 平台外观（?platform=ios）',trigger:'工作台「运行平台」切到 iOS，或本列表点入',desc:'顶部状态栏「药丸挖孔」（灵动岛）样式；键盘底栏是「地球 + 语音输入（按住说话）」两颗键',note:'三端外观差异另见「平台差异」表；切平台同时影响选图的接力文案等仿真行为'},
    {id:'platform-harmony',group:'系统外观',name:'平台外观 · 鸿蒙',route:'键盘 › 平台外观（?platform=harmony）',trigger:'工作台「运行平台」切到鸿蒙，或本列表点入',desc:'顶部状态栏「圆点挖孔」样式；键盘底栏左侧「地球」键（切换输入法）、右侧「小艺」星芒标识（纯装饰，不选不亮、点击无反应）',note:'三端外观差异另见「平台差异」表'},
    {id:'platform-android',group:'系统外观',name:'平台外观 · Android',route:'键盘 › 平台外观（?platform=android）',trigger:'工作台「运行平台」切到 Android，或本列表点入',desc:'顶部状态栏「圆点挖孔」样式；键盘底栏整条不渲染（Android 无此栏），覆盖层 / 选择器直接铺到屏幕底部',note:'三端外观差异另见「平台差异」表'},
    /* 键盘形态的付费引导：额度不足时盖住整个键盘区域（与主 App「会员与积分」页是两套商品、两套皮肤） */
    {id:'kb-paywall',group:'会员与积分',name:'会员开通覆盖层（主 App / 键盘共用）',route:'键盘 › 整页覆盖层；主 App › 整页覆盖层（「我的」横幅 / 额度不足）',trigger:'① 键盘模式下发起 AI 生成（立即分析 / 重新生成 / 语音追问 / 键盘发送）时额度不足 —— 左栏「模拟 › 模拟额度耗尽」打开（积分清零且非会员）；② 主 App 点「我的」的会员横幅「立即查看」、或主 App 形态下发起的生成额度不足（原「会员与积分」整页已删，两处打开的是同一层）。本列表点入为静态查看（现场把额度置成耗尽，不落库）',desc:'额度不足（或主 App 点会员横幅）时打开这一层：键盘形态铺满**整个键盘区域**（菜单栏 / 键区 / 底栏一并盖住；键盘高度不额外拉高，就是常规键盘那一块 250px / 矮窗口 210px）、从下往上滑入；主 App 形态浮在整个主 App 上。结构自上而下：① 右上角一枚圆形 X（只收起这一层回键盘，额度仍是 0 —— 再发起生成还会弹）；② 两行居中标题「成为LoveCo会员，/ 无限次使用AI功能～」（16px 深墨字，两行等宽居中排，标题上方**不再放**「3000 万+用户选择」「第 1 名」那两块徽章）；③ 三档商品卡**横向等分并排**（永久会员 ¥128 / 周会员 ¥9.9 / 季度会员 ¥98，卡内自上而下：12px 灰档位名 → 20px 加粗现价（¥ 比数字小一档）→ 11px 灰字划线原价 ¥576 / ¥48 / ¥128），选中的那张浅紫底 + 2px 紫描边、其余白底浅灰描边，点卡片即切换选中档位（默认永久会员）；④ 整宽蓝色胶囊「立即解锁」（在滚动列内 —— 不是钉在底栏上方；右上角悬一枚红色小标，**文案随档位变**：永久会员「一次性买断」/ 周会员「畅享 7 天」/ 季度会员「畅享 90 天」）；⑤ **协议行沉在按钮下方** —— 10px 灰字「我已阅读并同意《会员协议》、《续费协议》」，**不带勾选框**（已按需求去掉，购买不再前置勾选），两份协议名都是同一层里可点的深色文字按钮：点开键盘内协议正文页 kb-legal，压在这一层之上、X 一关即回本层；**永久会员那一档只留《会员协议》**（一次性买断、不涉续订），《续费协议》跟着下方那段说明一起不出现；⑥ **自动续订说明**（照设计图 1:1：iTunes 自动续订、到期前 24 小时内扣费、取消方式、试用期规则；文案本身是 iOS 场景的，**只在 iOS 渲染**）压在协议行下面；⑦ 平台底栏（键盘形态才渲染：kb-navbar，Android 不渲染、面板直接铺到屏幕底边；主 App 形态没有这条，这一层直接铺到主 App 底边）。**协议与说明默认在可视区之外**（设计图的小心机）：整列内容高过这一层，首屏只看到标题 / 三档卡 /「立即解锁」，把这一层往上滚一段才露出协议与说明（常规 250px 档约多出 200px 可滚内容、矮窗口 210px 档约 160px；永久会员档少了说明那一段，也仍差约 30px 才够到协议行）。**未勾选协议就点「立即解锁」的拦截已随勾选框一并去掉**：点它**直接**一键到账（purchase 动作，2026-09-26 起不再经「确认模拟订单 → 权益已到账」两个中间页），会员当场生效、本层收起（键盘形态回键盘、主 App 形态停原页）',note:'商品取 PLANS（永久 ¥128 / 周 ¥9.9 / 季度 ¥98，均带划线原价、kind 一律 member）—— 主 App 与键盘形态**共用这一张表**（原「键盘内三档 vs 主 App 月度 / 年度 / 积分」两套分开卖的做法已随主 App 会员页删除作废；积分档就此不存在）；设计图里的两块徽章（3000 万+用户选择 / 第 1 名）与永久会员卡上的「告白季特惠」标签按要求不呈现；皮肤固定浅色（顶部淡紫渐变向下渐隐到白），不跟随键盘的浅色 / 深色外观；Esc 与 X 同一条出口；「立即解锁」当场到账并收起本层（会员态即时变化）；键盘形态里协议行与续订说明是「往上滚一段才看得到」的（首屏在按钮处收住），主 App 形态同理；《续费协议》与自动续订说明只对周 / 季度两档出现，永久会员档不显示；说明文案是 iOS 场景的，Android / 鸿蒙下只保留协议行'},
  ];
  const APP_PAGES = [
    {id:'home',name:'首页',route:'/home',trigger:'主 App 底部 Tab 第一项「首页」；登录成功后也落在这里',desc:'**空白模板**：原首页的四段内容（问候行 / 会员横幅 /「快捷开始」/「我的对象」+「账户概览」）已按需求全部删除，这一页现在只留整页骨架（.app-content.app-page），不渲染任何元素 —— 只有底部 Tab 栏照常，等按新设计重做',note:'主 App 的落地页（启动闸门先查联网，再按状态检查链走：键盘权限 → 键盘完全访问 → 登录状态，哪一环没过就停在对应引导上 —— 整页「开启键盘」引导 / 完全访问引导层 / 键盘同款登录层，都通过才停在首页，见 appEntryGuards）。因内容清空，原先挂在这一页的入口（去键盘问 AI / 分析聊天截图 / 键盘设置 / 模拟订单 / 兑换积分 / 新建对象）在主 App 内随之不再可达：新建对象改从「对象」页进（模拟订单 / 兑换积分 / 键盘设置三个页面与入口已于 2026-09-26 整体删除）'},
    {id:'account',name:'我的',route:'/account',trigger:'主 App 底部 Tab 第三项「我的」',desc:'按设计图重做的「我的」页，自上而下：① 问候行（「你好，昵称」+ 折角箭头，点它进个人资料；已开通会员时下面多一行金色会员标识「L+ 会员到期日 2026-09-30」，永久档写「永久会员」）；② 会员横幅（未开通蓝底「成为 L+ 会员 / 解锁全部高级功能」，已开通橙底「L+ 会员 / 已解锁全部高级功能」，右侧白胶囊「立即查看」弹出**键盘同款的会员开通覆盖层** —— 原「会员与积分」整页已删）；③「客户支持」卡片两行（键盘内容投诉与举报 → 反馈页并把类型预选成「举报」；反馈与建议）；④「账户」卡片一行（退出登录）；⑤「相关协议」卡片五行（用户协议 / 隐私政策 / 个人信息收集清单 / 第三方信息共享清单，各自打开对应协议正文覆盖层，末行进协议中心看全部）。设计图里右上角的邮箱图标（消息通知）、「基础设置 · 键盘基础预设」与「消息提醒 · 消息通知」两组按需求不呈现（键盘设置页面与入口已于 2026-09-26 整体删除）。2026-09-26 另删三行入口：「在线客服」「我的订单」「兑换积分」（对应页面一并删除）；同日晚些时候卡片下方那枚「注销仿真账户」文字按钮也删除（连同确认框链路，页面至此没有任何注销类入口）',note:'「我的」不再有键盘设置入口（该页面已删除）；注销入口已删，页面内不再有「需先清空会员 / 积分才能操作」的前置条件；这一页需要登录 —— 未登录时点「我的」Tab 不切页，就地弹出键盘同款的登录覆盖层（原独立登录页已删）'},
    {id:'account-member',name:'我的 · 已开通 L+ 会员',route:'/account（会员态）',trigger:'本列表点入（现场摆上会员标识与到期日 2026-09-30，不落库）；真实链路里购买会员到账后也是这一形态',desc:'「我的」页的会员态：问候行下方多一行金色会员标识（小方块「L+」+「会员到期日 2026-09-30」，永久档写「永久会员 · 已解锁全部高级功能」），会员横幅同时换成橙底「L+ 会员 / 已解锁全部高级功能」，其余分区（客户支持 / 账户 / 相关协议）与未开通时完全一致',note:'会员到期日与会员标识一起持久化：购买后写入（主 App 与键盘内是同一张商品表 —— 永久档落 0 = 永久，周 / 季度档按 7 / 90 天算）；老存档只有会员标识、没有到期信息时不硬编日期，只说「已解锁全部高级功能」'},
    {id:'profile',name:'个人资料',route:'/account/profile',trigger:'「我的」页最上方的问候行（「你好，昵称」）',desc:'昵称、性别、年龄段（选填）编辑并保存（PATCH /v1/me）。这里的性别也是对象编辑页「性别默认取反」的依据',note:'昵称会同步到聊天页「我」的头像兜底与各处显示'},
    {id:'feedback',name:'反馈与建议',route:'/feedback',trigger:'「我的」· 客户支持 ·「反馈与建议」；从「键盘内容投诉与举报」进来时类型预选「举报」',desc:'反馈类型（功能问题 / 键盘问题 / AI 效果 / 建议 / 投诉 / 举报）+ 详细说明提交（POST /v1/feedback）；页内不再有「我的反馈」入口',note:'提交成功后回「我的」页（原落点「我的反馈」页与反馈历史记录已删除，反馈不留历史列表）'},
    {id:'legal-list',name:'协议中心',route:'/legal',trigger:'「我的」· 相关协议 ·「协议中心」',desc:'内置 7 份协议的列表（用户协议、隐私、会员与积分、自动续费、联通认证等），点任一行打开**协议正文覆盖层**（不是独立页面，见下）',note:'协议为静态快照，不联网更新；协议正文原是一个独立页面（/legal/:key），2026-09-26 按需求删除页面后降级为浮在当前页上的覆盖层（state.appLegal），X / 返回 / Esc 关掉即回原页'},
    {id:'partners',name:'聊天对象',route:'/partners',trigger:'主 App 底部 Tab 第二项「对象」；编辑保存后回到这里',desc:'对象管理列表（整页，纯管理）：标题行一行「聊天对象」+ 右侧「新建」文字按钮 —— 标题行下**没有**「当前上下文：…」那行说明，列表里也**没有「不选择」行**（清空 / 切换当前上下文只在键盘形态的管理页里做）；每行 = 圆形头像 + 备注名，**只有写过备注的对象才多一行备注**（最多两行 —— 没备注的行不占位、不写「还没有备注 —— …」提示语；**性别 · 关系阶段不在列表里出现**，进详情页才看得到）；顺序按最近操作在前（新建的排最前，编辑过的保存后提到最前）。**整行（含头像）都是点击区**：按下时整行铺一层淡紫高亮（`.partner-open:active`，不再画头像描边的选中态），松手进该对象的**详情页 = 编辑页**（字段预填，可改、底部只有一颗不带图标的「确定」）—— 点行**不改当前上下文**；左滑露出编辑 / 删除（从行右侧滑入、盖在行内容上，删除直接执行不二次确认，「编辑」与行点击同一动作）',note:'与键盘形态的管理页是同一份数据、同一套排序、同一套左滑动作，只是主 App 下渲染为整页；「不选择」条目与「切当前对象」只在键盘形态的管理页里 —— 两种形态的行点击语义不同：主 App 进详情（编辑页），键盘切当前对象'},
    {id:'partner-new',name:'新增聊天对象',route:'/partners/new',trigger:'主 App「聊天对象」页右上角「新建」',desc:'对象编辑页（整页，底部「确定」保存并回到对象列表、该对象排最前）：头像槽（点它从本地选图上传，选完居中裁成方形）、备注名、**性别**（下拉：暂不设置 / 女 / 男 —— 新建态默认取当前用户性别的「反」，用户是男默认女、用户是女默认男，用户自己还没设置性别时落到「女」）、关系阶段（五档，默认「熟悉」）、**备注信息多行输入框**（提示语「写下 TA 的年龄、职业、爱好，例如「28 岁，设计师，喜欢露营和看展」。写得越细，AI 越懂 TA。」），表单是白色圆角卡片、字段自上而下单列排布；标题行右侧一枚**退出 X**（图标钮 `.icon-btn`，title / aria-label「退出」，`data-action="close"` —— 不保存直接回上一层，从对象列表点进来就回对象列表）；底部「确定」是一颗**不带图标**的整宽主按钮（此前的对勾符号按需求去掉）',note:'与键盘版编辑面板（kb-partner-editor）对应但字段更多：键盘版只有备注名 + 关系阶段、改动即静默保存；主 App 版保留性别与备注信息两个字段（性别默认取反、备注提示语带年龄 / 职业 / 爱好三个关键词），仍是「确定」保存'},
    {id:'partner-edit',name:'编辑聊天对象',route:'/partners/edit',trigger:'主 App「聊天对象」页点对象行（进详情）或对象行左滑「编辑」',desc:'与「新增聊天对象」同一表单的编辑态：字段预填对象当前值（含头像「更换头像」、性别与备注信息），「确定」保存回列表并把该对象提到最前；标题行右侧同样有**退出 X**（同一颗图标钮，不保存即回上一层）；**页内没有「删除这个对象」入口**（按需求去掉，原确认框链路 delete-partner / delete-partner-confirm 一并删除 —— 删除对象只走列表左滑那颗直接删的按钮）',note:'主 App 与键盘版的编辑面板现在都不给删除入口（键盘版更早去掉）—— 删除只走列表左滑，直接删、不二次确认'},
    /* 「开启键盘」引导流程（2026-09-27）：进入主 App 先查网络、再查键盘，未开启就整页进这条流程。
       引导页按需求拆成**三端各一条**（形态大致相同、各有差异，见各条 desc）：演示动画素材
       按运行平台取（目前只有鸿蒙一支，其余端回落，见 app.js 的 GUIDE_VIDEOS）；
       鸿蒙 / iOS 是一步形态（一颗按钮），**安卓是两步形态**（两颗按钮 —— 键盘启用后再切换
       当前输入法，见 appGuideHome / guideStepState）；模拟设置页 / 详情页三端暂共用鸿蒙样式。 */
    {id:'kb-guide',name:'开启键盘 · 引导页(鸿蒙)',route:'/kb-guide?platform=harmony',trigger:'进入主 App：启动闸门先查联网，再按**状态检查链**走（键盘权限 → 键盘完全访问 → 登录状态，见 appEntryGuards），第一环没过（左栏「设备权限 › 开启键盘」关闭）时整页进这条引导；本列表点入（切到鸿蒙，并现场把「开启键盘」置成关，不落库）',desc:'紫蓝色整页（无底部 Tab 栏），**全页元素整体上下居中**（不挤在顶部；内容比屏高时自然从头排、可滚动），自上而下：① 中央白色大圆角卡内嵌**演示动画视频**（循环播、**带声音** —— 素材自带音轨，只是浏览器禁止「有声音的自动播放」，所以先静音起播、拿到用户手势（页面上点过任何一处即算）随即开声音，见 app.js 的 wireGuideVideos；鸿蒙版素材 assets/Enable LoveCo Keyboard HarmonyOS.mp4，画面即「在输入法管理中启用 LoveCo」的操作演示）；② 卡下一行白色小字说明「在「输入法」管理中，启用LoveCo输入法」（不写「第1步」）；③ 黑色胶囊主按钮「启用LoveCo输入法 →」—— 整颗**持续放大缩小、一闪一闪**地引导点击（kg-breathe：1.6s 一个来回，scale 1 ↔ 1.045 配深蓝呼吸投影），点它进模拟鸿蒙设置页。鸿蒙引导页只有这一颗按钮（原「切换到LoveCo输入法」幽灵按钮已按需求删除；安卓版是**两步两颗按钮**的另一套形态，见 kb-guide-android）：完成引导改由「从系统设置返回 App」触发 —— 在设置里打开「启用LoveCo」后，点左下角视频悬浮窗即完成引导回首页',note:'整页落在 appScreen=kb-guide 上，正文与状态栏连成一片紫蓝（状态栏文字转白）；Esc 不提供出口，只能走页面自身的按钮与返回。完成引导（点悬浮窗返回 App）后接着跑状态检查链的后两环 —— 键盘完全访问 → 登录状态，没过就停在对应引导层上（见 finishGuide / appEntryGuards）'},
    {id:'kb-guide-android',name:'开启键盘 · 引导页(安卓)',route:'/kb-guide?platform=android',trigger:'进入主 App：启动闸门先查联网，再按状态检查链走（键盘权限 → 键盘完全访问 → 登录状态，见 appEntryGuards），第一环没过（键盘未开启）时整页进这条引导；本列表点入（切到 Android，并现场把「开启键盘」置成关、当前输入法复位成系统默认，不落库）',desc:'与「开启键盘 · 引导页(鸿蒙)」共用同一条渲染链路 appGuideHome（拆条是为了分头补各端差异），但安卓是**两颗按钮的两步形态**（2026-09-27 起）：紫蓝整页、白圆角大卡循环播演示动画（安卓素材未提供前回落鸿蒙那支，GUIDE_VIDEOS 里还没有 android 键）、一行说明「在「输入法」管理中，启用LoveCo输入法」、元素整体上下居中。按钮自上而下：① 黑胶囊「**第一步 启用LoveCo输入法 →**」；② 同款黑胶囊「**第二步 切换到LoveCo输入法 →**」。两颗**状态互斥、只有轮到的那颗亮**（kg-breathe 持续放大缩小、一闪一闪；没轮到的那颗置灰、不可点、不跳动，见 .kb-guide-btn:disabled）：键盘未启用（左栏「设备权限 › 开启键盘」关闭）时第一步亮、第二步灰 —— 点第一步进模拟设置页启用键盘；**键盘已启用但「当前输入法」还不是 LoveCo 时**（安卓系统不允许 App 直接切输入法，得由用户自己走这一步），第一步置灰、第二步亮 —— 点第二步同样进模拟设置页，把「默认输入法」行切成 LoveCo；两步都完成即离开引导页、回主 App 首页（判定见 guideStepState / guideSatisfied；首页前还会接着跑状态检查链的后两环 —— 完全访问 → 登录，没过就停在对应引导层上）。平台外观随运行平台（Android 无平台底栏、状态栏圆点挖孔）；模拟设置页 / 详情页三端暂共用鸿蒙样式',note:'「当前输入法」在左栏「设备权限」里也能手动切（系统默认 / LoveCo，默认系统默认）—— 选 LoveCo 会顺带把「开启键盘」打开；反向关掉「开启键盘」则当前输入法复位成系统默认。素材补齐后往 GUIDE_VIDEOS 加 android 键；系统设置页要按端分叉时（安卓设置页外观与鸿蒙不同），再走 platform 分支'},
    {id:'kb-guide-ios',name:'开启键盘 · 引导页(ios)',route:'/kb-guide?platform=ios',trigger:'进入主 App：启动闸门先查联网，再按状态检查链走（键盘权限 → 键盘完全访问 → 登录状态，见 appEntryGuards），第一环没过（键盘未开启）时整页进这条引导；本列表点入（切到 iOS，并现场把「开启键盘」置成关，不落库）',desc:'与「开启键盘 · 引导页(鸿蒙)」**同一形态**（拆成三端条目是为了分头补各端差异，共用同一条渲染链路 appGuideHome）：紫蓝整页、白圆角大卡循环播演示动画、一行说明「在「输入法」管理中，启用LoveCo输入法」、唯一黑胶囊主按钮（kg-breathe 呼吸动画；iOS 一步完成，**安卓版是两步两颗按钮**，见 kb-guide-android）、元素整体上下居中。**iOS 差异（待补）**：演示动画素材按平台取 —— iOS 素材未提供前**回落到鸿蒙那支**（GUIDE_VIDEOS 里还没有 ios 键）；模拟设置页 / 详情页三端暂共用鸿蒙样式；平台外观随运行平台（状态栏药丸挖孔 / 灵动岛、键盘底栏是地球 + 语音输入）',note:'素材补齐后往 GUIDE_VIDEOS 加 ios 键；系统设置页要按端分叉时（iOS 设置页外观与鸿蒙不同），再走 platform 分支'},
    {id:'kb-guide-settings',name:'开启键盘 · 模拟鸿蒙设置（输入法）',route:'引导页 ›「第一步 启用LoveCo输入法」/「第二步 切换到LoveCo输入法」（模拟系统设置）',trigger:'引导页点任一步按钮（第一步、第二步同一个落点）；本列表点入',desc:'模拟鸿蒙系统「输入法」设置页的**深色整页**：顶部圆形返回钮 + 大标题「输入法」；「输入法管理」灰色小标题；第一张深色卡片「默认输入法 | 小艺输入法 ▾」——**这一行可点**（LoveCo 已启用后点它在「小艺输入法」与「LoveCo」之间来回切，= 安卓引导第二步在系统里的落点，见 switchGuideIme；LoveCo 还没启用时整行不可点、压暗 —— 真实系统里未启用的输入法也选不了），右侧值随当前输入法变化；第二张卡片是输入法列表 —— **小艺输入法**（蓝色勾选圈 + 折角箭头，已启用）与 **LoveCo**（空心圈，右侧「未启用 ›」，启用后改「已启用」）。设计稿里其它几个第三方输入法按需求不渲染（除小艺外全部删掉，只留 LoveCo）。**左下角悬浮窗**（画中画）：同一支演示视频缩成小窗循环播放（**带声音**，与引导页大卡同一套处理，见 wireGuideVideos），「启用LoveCo」打开后浮现绿色对勾与「完成后返回LoveCo App」小字 —— 点它 = 从系统设置**返回 LoveCo App**：重新校验（安卓要求键盘已启用**且**当前输入法已切成 LoveCo，见 guideSatisfied），都通过就关闭引导页（完成引导，进主 App 首页 —— 首页前还会接着跑状态检查链的后两环：完全访问权限 → 登录状态，没过就停在对应引导层上）；安卓下只启用了键盘、还没切输入法就退回引导页 —— 这时第一步已灰、第二步亮着等点击。点 LoveCo 行进它的详情页',note:'返回箭头回引导页（若两步已齐则直接完成引导、回首页，不停在「两颗按钮都灰」的死状态）；「默认输入法」行的切换本身不结束引导 —— 完成仍在点悬浮窗 / 返回箭头那一刻校验'},
    {id:'kb-guide-detail',name:'开启键盘 · LoveCo 详情（双开关）',route:'模拟设置 › LoveCo 行（模拟系统设置）',trigger:'模拟鸿蒙设置页点「LoveCo」行；本列表点入',desc:'LoveCo 输入法在系统设置里的详情页（深色整页）：顶部圆形返回钮 + 大标题「LoveCo」，下方一张深色卡片放两个开关行 —— ①「启用LoveCo」：**默认关**，蓝色鸿蒙样式开关，打开即键盘启用（与左栏「开启键盘」是同一个开关 permissions.kbEnabled）；②「完整体验模式」：**第一个开关打开之后才显现**（默认关，显现带淡入）。左下角同一颗视频悬浮窗：启用后浮现绿色对勾与「完成后返回LoveCo App」，点它 = 返回 LoveCo App 并重新校验权限（安卓要求当前输入法也已切到 LoveCo）—— 通过就关闭引导页（完成引导，回主 App 首页 —— 首页前还会接着跑状态检查链的后两环：完全访问权限 → 登录状态，没过就停在对应引导层上）；走返回箭头则逐级退回模拟设置页 / 引导页',note:'「启用LoveCo」关掉即回到未启用态（第二个开关随之隐藏、悬浮窗对勾消失），同时把「当前输入法」复位成系统默认（未启用的键盘不可能当当前输入法）；返回箭头回模拟设置页'},
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
       （额度仍是 0 —— 再发起生成会按 state.creditsOut 重新弹） */
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
     （先权限后登录这条链路的下一环），都满足才回键盘 */
  function grantKbFullAccess() {
    state.permissions.keyboard = true;
    state.kbFullAccess = false;
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
  /* 唤起 / 启动时的登录检查：未登录即弹出登录层（返回 true 表示已经渲染过，调用方别再渲染） */
  function checkKbLogin() {
    if(state.loggedIn)return false;
    openKbLogin();
    return true;
  }
  /* 收起登录层（X / Esc / 登录成功提示播完共用）：顺带把成功提示的定时器摘掉；
     压在登录层上面的协议正文页（kb-legal）也一并收起 —— 它只为登录层的协议名服务 */
  function closeKbLogin() {
    clearTimeout(state.kbLoginTimer); state.kbLoginTimer = null;
    state.kbLogin = '';
    state.kbLegal = '';
  }
  /* —— 键盘内协议正文页（kb-legal 组件）：登录层协议行里点协议名打开 ——
     正文与主 App「协议中心」同一份快照（legal-data.js），只是缩到键盘这一条高度里滚动浏览。
     X / Esc 关掉只收起本页、回登录层（协议勾选状态不动）；关闭登录层 / kbReset 时随登录层一并收起。 */
  function openKbLegal(key) {
    if (!window.LOVECO_LEGAL || !window.LOVECO_LEGAL[key]) return;
    abortVoiceHold();
    state.kbLegal = key;
    /* 这一层自己的「从下往上弹出」：只在打开那一次渲染播放（登录层不跟着重播，见 kbLegalEnter） */
    state.kbLegalEnter = true; render(); state.kbLegalEnter = false;
  }
  function closeKbLegal() { state.kbLegal = ''; }
  /* —— 会员开通覆盖层（kb-paywall 组件，主 App 与键盘形态共用同一层）——
     触发两处：① 键盘形态发起生成时额度不足（左栏「模拟 › 模拟额度耗尽」打开：积分清零且非会员），
     generate() 拦下生成后打开；② 主 App 形态点「我的」的会员横幅「立即查看」、或额度不足发起生成 ——
     两处打开的是同一层、同一套设计、同一张商品表（PLANS）。
     键盘形态打开前把其它覆盖层收掉（同一时刻只留一层）—— 这一层只占**常规键盘那一块**
     （250px / 矮窗口 210px），得先把会把键盘拉高的面板收掉：聊天分析面板 / 选图选择器 /
     AI 分析过渡页 / 对象编辑面板还在的话，`.keyboard` 仍是 with-picker 的三分之二屏，
     这一层跟着 `inset:0` 就会铺满三分之二屏（不是键盘那一块）；对象管理页 / 设置页一并收掉。
     主 App 形态不动当前页与 modalData（这层只是浮在页面上的覆盖层）。
     协议行不带勾选框（已按需求去掉）：点「立即解锁」直接购买（purchase 一键到账）。
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
     再发起生成还会弹）；协议正文页（kb-legal）可能是从这层的协议名点开的，一并收起 */
  function closeKbPaywall() { state.kbPaywall=false;state.kbLegal=''; }
  /* 交给 kb-legal 组件的正文数据（未打开 / key 不存在时为 null，组件整层不渲染） */
  function kbLegalDoc() {
    const d = window.LOVECO_LEGAL && window.LOVECO_LEGAL[state.kbLegal];
    return d ? { title: d.title || d.name || '协议正文', body: d.body || '暂未载入正文' } : null;
  }
  /* 未勾选协议就点「本机号一键登录」：让底部协议行抖一下提示先勾选 ——
     不重渲染（重建 DOM 会把动画一起重建）、也不用全局提示条（toast 组件已整体删除），
     就地在协议行上播一次：先摘类 + 强制重排，连点也能重放。 */
  function shakeKbConsent() {
    const node = document.querySelector('.kb-login .kbl-consent');
    if(!node)return;
    node.classList.remove('shake');
    void node.offsetWidth;
    node.classList.add('shake');
    node.addEventListener('animationend', () => node.classList.remove('shake'), {once:true});
  }
  /* 登录成功后的收尾：一键登录与短信登录共用 —— 先给一记「登录成功」提示（登录层的收尾形态，
     KB_LOGIN_DONE_MS 之后自动收起），再回到键盘；状态落库，号码由调用方写进 state.phone。 */
  const KB_LOGIN_DONE_MS = 1000;
  function finishKbLogin() {
    state.loggedIn = true;
    persist();
    clearTimeout(state.kbLoginTimer);
    state.kbLogin = 'done';
    state.kbLoginTimer = setTimeout(() => { state.kbLoginTimer = null; state.kbLogin = ''; render(); }, KB_LOGIN_DONE_MS);
    render();
  }
  /* 点击页面列表项后把手机跳到对应页面：
     主 App 形态 = openAppScreen（id 与页面路由一致）；
     键盘形态 = 按条目设置键盘状态（覆盖层开关 / 打字态 / 键盘布局 / 选中对象…）。
     「AI 分析过渡页」不设定时器：避免 1 秒后自动切走，方便静态查看（真实链路里由 openScanPanel 播完接面板）。 */
  function setupPage(it) {
    if(state.appView==='app'){
      /* 目录里的整屏流程子页（不在 appScreens 集合、从流程中途进入）：静态跳转补上运行上下文
         （原「确认模拟订单」「权益已到账」两条子页已随购买链路合并而删除） */
      if(it.id==='partner-new')return openAppScreen('partner-edit');
      if(it.id==='partner-edit'){const p=state.partners[0];return openAppScreen('partner-edit',p?{id:p.id}:{});}
      /* 「我的 · 已开通 L+ 会员」看的是「我的」的会员态：现场摆上会员标识与到期日
         （2026-09-30），不落库 —— 刷新页面即回到真实会员状态 */
      if(it.id==='account-member'){state.member=true;state.memberExpiry=new Date(2026,8,30).getTime();return openAppScreen('account');}
      /* 「开启键盘」引导流程（引导页三端各一条 + 模拟设置两页）：点引导页任一条目时
         先切到它对应的运行平台（引导页形态三端大致相同、演示动画素材按平台取，见 GUIDE_VIDEOS），
         再现场把「开启键盘」置成关、落引导页（不落库 —— 刷新即恢复）；
         设置页 / 详情页保持当前开关状态，方便查看「已启用」后的形态 */
      if(it.id==='kb-guide'||it.id==='kb-guide-android'||it.id==='kb-guide-ios'){
        state.platform=it.id==='kb-guide-android'?'android':it.id==='kb-guide-ios'?'ios':'harmony';
        persist();
        state.permissions.kbEnabled=false;state.permissions.ime='system';state.appScreen='kb-guide';state.modal='kb-guide';state.kbGuidePage='guide';
        return render();
      }
      if(it.id==='kb-guide-settings'){state.kbGuidePage='settings';return openAppScreen('kb-guide');}
      if(it.id==='kb-guide-detail'){state.kbGuidePage='detail';return openAppScreen('kb-guide');}
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
      /* 选图形态：带一张附图（缩略图行 + 网格里的序号 1 + 由此带出的快捷栏），
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
         再就地打开「用户注册协议」那份正文 —— 停在协议正文上，X 一关就回登录层 */
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
      /* 语音追问后的 AI 通用回复（静态查看）：面板停在 done 态，内容是「模拟 › 语音指令」那句话
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
      default: kbReset(); return render(); /* host-chat：清场后即为目标页面（离开按住说话等静态态也走这里） */
    }
  }
  /* 左栏只留两组切换器（App形态 / 运行平台）—— 页面列表已移到右栏整节（见 pageListSection） */
  function deviceSwitchers() {
    return `<div class="switcher"><span class="switch-label">App形态</span>${surfaceButtons()}</div><div class="switcher"><span class="switch-label">运行平台</span>${platformButtons()}</div>`;
  }
  /* 左栏「设备权限」整节：**设备级**而非某一种 App形态的控件 —— 切到主 App 只是换了一层 App，
     同一台设备的这些权限照旧存在，所以键盘模式与主 App 模式共用这一节（render / renderApp 都渲染它）。
     五项的监听统一在 bind() 里按 id 挂（查不到就跳过）、相册三档走 photos 动作、当前输入法
    两档走 ime 动作，都是 render() 收尾 —— render() 在主 App 下会转发 renderApp()，
    因此两处渲染同一份结构即可，无需各写一套。 */
  function permissionSection() {
    const P=state.permissions;
    return `<div class="rail-section"><div class="rail-heading"><h2>设备权限</h2></div><div class="kv"><span>网络访问</span><strong>${P.network?'正常':'已关闭'}</strong></div><div class="control-line"><label for="perm-cellular">蜂窝网络</label><input id="perm-cellular" class="switch" type="checkbox" ${P.cellular?'checked':''}></div><div class="control-line"><label for="perm-kb-enabled">开启键盘</label><input id="perm-kb-enabled" class="switch" type="checkbox" ${P.kbEnabled?'checked':''}></div><div class="control-line"><label for="perm-kb-full">键盘完全访问</label><input id="perm-kb-full" class="switch" type="checkbox" ${P.keyboard?'checked':''}></div><div class="switcher"><span class="switch-label">当前输入法</span><div class="segmented" role="group" aria-label="当前输入法">${[['system','系统默认'],['loveco','LoveCo']].map(([id,name])=>`<button data-action="ime:${id}" class="${P.ime===id?'active':''}" aria-pressed="${P.ime===id}">${name}</button>`).join('')}</div></div><div class="switcher"><span class="switch-label">相册访问权限</span><div class="segmented" role="group" aria-label="相册访问权限">${[['denied','关闭'],['limited','有限访问'],['full','完整访问']].map(([id,name])=>`<button data-action="photos:${id}" class="${P.photos===id?'active':''}" aria-pressed="${P.photos===id}">${name}</button>`).join('')}</div></div></div>`;
  }
  /* 右栏「页面列表」整节：按当前 App形态列出全部页面 / 组件形态，组名可折叠，点条目手机即跳到该页面。
     原先它是左栏「运行平台」底下的一组切换器，现独占右栏一栏（左栏改放设备权限 + 模拟）。 */
  function pageListSection() {
    return `<div class="rail-section"><div class="rail-heading"><h2>页面列表</h2></div><div class="page-list" id="page-list">${pageList()}</div></div>`;
  }
  /* 主 App 的页面集合（页面列表里登记、openAppScreen 可跳的整页）。
     2026-09-26 按需求删掉 8 个页面：`checkout` 确认模拟订单 / `paid` 权益已到账 / `orders` 模拟订单 /
     `redeem` 兑换积分 / `tickets` 我的反馈 / `legal` 协议正文 / `support` 在线客服 / `settings` 键盘设置
     —— 其中协议正文降级成覆盖层（state.appLegal），购买链路合并成一步直接到账（见 purchase 动作），
     其余连入口一并删除，勿再补回。
     同日晚些又删 2 个：`login` 登录 LoveCo / `membership` 会员与积分 —— 两个整页都不再存在，
     登录改弹**键盘同款的登录覆盖层**（kb-login 组件，见 openKbLogin / needLogin），
     会员开通改弹**键盘同款的付费覆盖层**（kb-paywall 组件，见 openPaywall），
     两处与键盘形态共用同一套设计与同一张商品表（PLANS），主 App 这边不再另做一套，勿再补回整页。 */
  const appScreens = new Set(['home','account','profile','feedback','legal-list','partners']);
  /* —— 主 App：底部 Tab 三页（首页 / 对象 / 我的）——
     主 App 形态的骨架 = 页面正文 + 底部 Tab 栏（首页 / 对象 / 我的，见 appTabBar）。
     **顶部没有导航栏**：状态栏之下直接就是正文，「我的」拿问候行当页头、「对象」拿
     「聊天对象 + 新建」那一行当页头，子页（会员与积分、登录…）用卡片自带的标题行；
     **首页目前是空白模板**（无页头、无内容）。回键盘形态不再有页头箭头，首页清空后
     原先那两条键盘入口也删掉了，只能走工作台左栏的 App形态切换。
     Tab 三页各有自己的整页结构（appHomePage /
     appPartnersPage / appAccountPage），其余子页（会员与积分、个人资料、反馈、协议中心、登录…）
     仍是渲染工具里的 sheet 卡片，直接作为正文铺在正文区里（卡片自带的标题行就是页名）——
     子页不属于任何 Tab，但按归属给父 Tab 留一层选中态（见 APP_TAB_OF）。
     三页共用两块：会员横幅（memberBanner，未开通蓝底 / 已开通橙底）与分区卡片
     （appSection：灰色分组标题 + 白色圆角卡片，卡内一行 = appRow）。 */

  /* 会员标识行文案：永久档（memberExpiry === 0）→「永久会员」；有时限 →「会员到期日 YYYY-MM-DD」；
     老存档只有会员标识、没有到期信息（memberExpiry === null）→ 只说已解锁，不硬编日期。 */
  function memberBadgeText() {
    if(state.memberExpiry===0)return '永久会员 · 已解锁全部高级功能';
    if(state.memberExpiry>0){
      const d=new Date(state.memberExpiry);
      return `会员到期日 ${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
    return '已解锁全部高级功能';
  }
  /* 会员横幅：「我的」用（原与首页共用，首页已清空）—— 未开通是蓝底「成为 L+ 会员」，已开通是橙底「L+ 会员」，
     右侧一颗白胶囊「立即查看」，点它弹出**键盘同款的会员开通覆盖层**（kb-paywall 组件，见 openPaywall；
     原「会员与积分」整页已于 2026-09-26 删除）。 */
  function memberBanner() {
    const on=state.member;
    return `<button class="member-banner${on?' is-member':''}" data-action="app-membership"><span class="mb-text"><strong>${on?'L+ 会员':'成为 L+ 会员'}</strong><small>${on?'已解锁全部高级功能':'解锁全部高级功能'}</small></span><span class="mb-cta">立即查看</span></button>`;
  }
  /* 分区：灰色小标题 + 白色圆角卡片（卡内是若干 appRow） */
  const appSection = (title,rows) => `<section class="app-section"><h3 class="app-section-title">${esc(title)}</h3><div class="app-card">${rows}</div></section>`;
  /* 卡片里的一行：左标签 +（可选）右侧说明 + 折角箭头，整行可点（data-action 交给事件委托） */
  const appRow = (label,action,end='') => `<button class="app-row" data-action="${action}"><span class="app-row-label">${esc(label)}</span>${end?`<span class="app-row-end">${esc(end)}</span>`:''}<i class="chev" aria-hidden="true">${icon('ArrowRight')}</i></button>`;

  /* 首页（空白模板）：原首页的四段内容 —— 问候行 / 会员横幅 /「快捷开始」（含去键盘问 AI、
     分析聊天截图、键盘设置三条入口）/「我的对象」头像条 /「账户概览」—— 已按需求全部删除，
     只留整页骨架（.app-content.app-page），不渲染任何元素，等按新设计重做。 */
  function appHomePage() {
    return `<div class="app-content app-page"></div>`;
  }
  /* —— 主 App 启动闸门的两块整页（appGate）：检查中 / 网络不可用 ——
     进入主 App 的第一屏：先发仿真网络请求查联网状态，通过才轮到键盘检查（见 appEntryCheck）。 */
  function appGatePage() {
    if(state.appGate==='checking'){
      return `<div class="app-content app-page app-gate"><span class="app-gate-spinner" aria-hidden="true"></span><p class="app-gate-title">正在检查网络…</p></div>`;
    }
    return `<div class="app-content app-page app-gate"><span class="app-gate-icon" aria-hidden="true">${icon('Connection')}</span><p class="app-gate-title">网络不可用</p><p class="app-gate-hint">请检查网络连接后重试</p><button class="app-gate-retry" data-action="app-gate-retry">重试</button></div>`;
  }
  /* —— 开启键盘引导流程（appScreen='kb-guide'，kbGuidePage 三态）——
     进入主 App 时网络检查通过、但键盘未开启（permissions.kbEnabled=false）就走这条流程。
     引导页三端**大致相同、各有差异**（见 README「需求记录」）：当前先做鸿蒙版 ——
     模拟设置页 / 详情页三端暂时共用，只有中央的演示动画按平台取：目前只有鸿蒙素材
     （设计给的录屏，其余端先回落到它，素材补齐后往 GUIDE_VIDEOS 里加键即可）。
     同一支视频在引导页中央大卡与设置页 / 详情页左下角的悬浮窗（画中画）里循环播。 */
  const GUIDE_VIDEOS = { harmony: 'assets/Enable LoveCo Keyboard HarmonyOS.mp4' };
  function guideVideo() { return GUIDE_VIDEOS[state.platform] || GUIDE_VIDEOS.harmony; }
  /* 演示动画**带声音**播（素材自带音轨：立体声 44.1kHz，见 README 文件结构）。
     但浏览器不允许「有声音的自动播放」—— 标签上直接去掉 muted 的话画面根本不播（更糟），
     所以 video 标签仍是 autoplay muted：先按静音起播保证画面在动，拿到用户手势后再摘掉静音。
     手势不用特意去点视频：页面上点过任何一处（页面列表、按钮、左栏开关…）就算数
     （Chrome 等按 navigator.userActivation.hasBeenActive 判定「与这个域名交互过」）；
     全程没被点过（例如直接开带 screen=kb-guide 的链接）就先静音循环，等首次点击 / 按键补上
     （guideSoundArmed 只挂一次全局监听）。被浏览器拦住时 unmuteGuideVideos 会自动退回静音。
     innerHTML 重建会把 video 节点整个换掉，所以每次 renderApp 后都要重新接一遍。 */
  let guideSoundArmed = false;
  function guideVideoNodes() { return [...document.querySelectorAll('.kb-guide-video-card video, .hz-pip video')]; }
  function unmuteGuideVideos() {
    guideVideoNodes().forEach(v => {
      if (!v.muted) { v.play().catch(() => {}); return; }
      v.muted = false;
      /* 仍被拦（没有用户手势）：退回静音接着播，别把画面停住 */
      v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
    });
  }
  function wireGuideVideos() {
    if (!guideVideoNodes().length) return;
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
  /* 引导完成的条件：键盘已启用；安卓还要「系统当前输入法是 LoveCo」（鸿蒙 / iOS 系统侧启用即完成）。
     消费方：引导页两步都完成的自动收尾、悬浮窗「返回 App」的重新校验（guidePipBack）、
     详情页开关与左栏「当前输入法」的收尾（都见 finishGuideIfDone）。 */
  function guideSatisfied() {
    return state.permissions.kbEnabled && (state.platform !== 'android' || state.permissions.ime === 'loveco');
  }
  /* 引导流程中若条件已满足就当场完成（离开引导页回主 App 首页）—— 各动作收尾统一走它：
     满足则完成并返回 true（已渲染，调用方直接 return）；不满足返回 false，调用方继续自己的 render。 */
  function finishGuideIfDone() {
    if(state.appView !== 'app' || state.appScreen !== 'kb-guide' || !guideSatisfied()) return false;
    finishGuide();
    return true;
  }
  function appKbGuideScreen() {
    if(state.kbGuidePage==='settings')return appGuideSettings();
    if(state.kbGuidePage==='detail')return appGuideDetail();
    return appGuideHome();
  }
  /* 引导页（紫蓝底整页，元素**整体上下居中**，见 theme.css 的 .kb-guide-page）：
     中央白圆角大卡循环播演示视频 + 卡下一行说明 + 黑胶囊主按钮（**持续放大缩小、一闪一闪**
     地引导点击，动画见 theme.css 的 kg-breathe）—— 点它进模拟设置页。
     按钮布局**按平台分叉**（2026-09-27 起）：
     - 鸿蒙 / iOS 一步：「启用LoveCo输入法」—— 系统侧启用即完成，
       引导完成走「从系统设置返回 App」（打开「启用LoveCo」后点左下角悬浮窗，见 guidePipBack）；
     - **安卓两步**：安卓系统不允许 App 直接切换输入法，键盘启用后还要用户在系统里把当前输入法
       切成 LoveCo，所以下面多挂一颗「第二步 切换到LoveCo输入法」（同样的黑胶囊，进同一个模拟设置页）。
       两颗按钮的可用 / 呼吸状态由「第一步」「第二步」完成情况决定（见 guideStepState）：
       ① 键盘未启用 → 第一步呼吸可点，第二步**置灰、不可点、不跳**；
       ② 键盘已启用、当前输入法还是系统默认 → 第一步**置灰、不可点、不跳**，第二步呼吸可点；
       ③ 两步都完成 → 引导完成（离开引导页回首页，各动作收尾统一走 finishGuideIfDone）。
     三端各有一条页面列表条目（kb-guide / kb-guide-android / kb-guide-ios），形态**大致相同**、
     演示动画素材按平台取（目前只有鸿蒙一支，其余端回落，见 GUIDE_VIDEOS）。 */
  function appGuideHome() {
    const { android, step1, step2 } = guideStepState();
    return `<div class="kb-guide-page">
      <div class="kb-guide-video-card"><video src="${guideVideo()}" autoplay muted loop playsinline></video></div>
      <p class="kb-guide-caption">在「输入法」管理中，启用LoveCo输入法</p>
      <button class="kb-guide-btn primary" data-action="kb-guide-settings"${step1?'':' disabled'}><span>${android?'第一步 ':''}启用LoveCo输入法</span><i aria-hidden="true">${icon('ArrowRight')}</i></button>
      ${android?`<button class="kb-guide-btn primary" data-action="kb-guide-switch"${step2?'':' disabled'}><span>第二步 切换到LoveCo输入法</span><i aria-hidden="true">${icon('ArrowRight')}</i></button>`:''}
    </div>`;
  }
  /* 悬浮窗（模拟设置页 / 详情页左下角的画中画）：同一支视频缩成小窗循环播；
     「启用LoveCo」打开后浮现绿色对勾与「完成后返回LoveCo App」小字 —— 点它 = 从系统设置
     **返回 LoveCo App**：App 侧重新校验一遍权限，已开启就关闭引导页（见 guidePipBack）。 */
  function guidePip() {
    const done = state.permissions.kbEnabled;
    return `<button class="hz-pip${done?' done':''}" data-action="kb-guide-pip" ${done?'':'aria-hidden="true" tabindex="-1"'}>
      <video src="${guideVideo()}" autoplay muted loop playsinline aria-hidden="true"></video>
      ${done?`<span class="hz-pip-check" aria-hidden="true">${icon('Check')}</span><span class="hz-pip-caption">完成后返回LoveCo App</span>`:''}
    </button>`;
  }
  /* 模拟鸿蒙「输入法」设置页（深色）：返回 + 标题、「输入法管理」小标题、
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
  /* LoveCo 输入法详情页（深色）：「启用LoveCo」开关（默认关 —— 打开它 = 键盘启用，
     与左栏「开启键盘」同一个开关）+「完整体验模式」开关（第一个打开后才显现，默认关）。
     左下角同一颗悬浮窗 —— 两颗开关都开好、点悬浮窗返回 App 即完成引导。 */
  function appGuideDetail() {
    const enabled = state.permissions.kbEnabled;
    return `<div class="hz-page">
      <header class="hz-top"><button class="hz-back" data-action="kb-guide-back" aria-label="返回">${icon('ArrowLeft')}</button><h1>LoveCo</h1></header>
      <div class="hz-card">
        <div class="hz-row static"><span class="hz-name">启用LoveCo</span><button class="hz-switch${enabled?' on':''}" role="switch" aria-checked="${enabled}" aria-label="启用LoveCo" data-action="kb-guide-enable"><i aria-hidden="true"></i></button></div>
        ${enabled?`<div class="hz-row static hz-row-late"><span class="hz-name">完整体验模式</span><button class="hz-switch${state.kbGuideFull?' on':''}" role="switch" aria-checked="${!!state.kbGuideFull}" aria-label="完整体验模式" data-action="kb-guide-full"><i aria-hidden="true"></i></button></div>`:''}
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
  /* 我的：按设计图重做 —— 问候（点它进个人资料）+ 会员标识行 + 会员横幅 + 客户支持 /
     账户 / 相关协议三组卡片。设计图里的「基础设置（键盘基础预设）」「消息提醒
     （消息通知）」两组与右上角邮箱图标按需求不做（键盘设置入口先挂首页、首页清空后已无）；
     四条协议直接打开对应正文（覆盖层，见 openAppLegal），卡片末尾一行进「协议中心」看全部。
     2026-09-26 按需求删除三行入口：「在线客服」（support 页删除）、「我的订单」「兑换积分」
     （orders / redeem 两个页面删除）——「账户」卡片只剩「退出登录」一行。同日晚些时候卡片
     下方那枚「注销仿真账户」文字按钮也按需求删除：注销确认框链路（delete-account /
     delete-account-confirm）与 state.deleted 一并清除，本页不再有注销类入口。 */
  function appAccountPage() {
    return `<div class="app-content app-page">
      <button class="app-hello as-button" data-action="profile"><span class="hello-text"><strong>你好，${esc(state.nickname)}</strong>${state.member?`<small class="member-line"><b>L+</b>${esc(memberBadgeText())}</small>`:''}</span><i class="chev" aria-hidden="true">${icon('ArrowRight')}</i></button>
      ${memberBanner()}
      ${appSection('客户支持',[appRow('键盘内容投诉与举报','report'),appRow('反馈与建议','feedback')].join(''))}
      ${appSection('账户',[appRow('退出登录','logout')].join(''))}
      ${appSection('相关协议',[appRow('用户协议','legal:terms'),appRow('隐私政策','legal:privacy'),appRow('个人信息收集清单','legal:collection'),appRow('第三方信息共享清单','legal:sharing'),appRow('协议中心','legal-list')].join(''))}
    </div>`;
  }
  /* 底部 Tab 栏：首页 / 对象 / 我的。子页保留父 Tab 的选中态（对象的新增 / 编辑算「对象」，
     其余账户类子页算「我的」），登录页不属于任何 Tab，不点亮。 */
  const APP_TABS = [['home','首页','home'],['partners','对象','users'],['account','我的','user']];
  const APP_TAB_OF = {home:'home',partners:'partners','partner-edit':'partners',account:'account',profile:'account',feedback:'account','legal-list':'account'};
  function appTabBar() {
    /* 启动闸门（检查中 / 网络不可用）与「开启键盘」引导流程没有底部 Tab（整页流程） */
    if(state.appGate||state.appScreen==='kb-guide')return '';
    const glyph = window.LoveCoSystemGlyphs;
    const active = APP_TAB_OF[state.appScreen] || '';
    return `<nav class="app-nav" role="tablist">${APP_TABS.map(([id,label,g])=>`<button data-action="app-tab:${id}" class="${active===id?'active':''}" aria-selected="${active===id}" role="tab">${glyph[g]}${label}</button>`).join('')}</nav>`;
  }
  /* 主 App 正文：Tab 三页与对象编辑页走各自的整页结构，其余子页仍是 sheet 卡片
     （把 sheet 外壳换成 .app-content 容器，卡片直接作为页面内容）。 */
  function appScreenContent() {
    const s = state.appScreen;
    /* 启动闸门（检查中 / 网络不可用）与「开启键盘」引导流程：都是主 App 自己的整页，
       此刻正文整页替换、底部 Tab 栏一并隐藏（见 appTabBar） */
    if(state.appGate)return appGatePage();
    if(s==='kb-guide')return appKbGuideScreen();
    if(s==='home')return appHomePage();
    if(s==='account')return appAccountPage();
    if(s==='partners')return appPartnersPage();
    if(s==='partner-edit')return partnerEditor();
    return renderModal().replace(/^<div class="modal-backdrop">/,'<div class="app-content">').replace(/<\/div>\s*$/,'</div>');
  }
  function renderApp() {
    const ctx = uiContext();
    /* 「模拟」组在左栏与「仿真控制台」弹层两处同时渲染时靠前缀区分控件 id（与键盘形态同一套机制） */
    state.renderedControls=false;
    const title = state.appScreen==='confirm' ? (state.modalData.title||'确认操作')
      : ({home:'首页',account:'我的',profile:'个人资料',feedback:'反馈与建议','legal-list':'协议中心',partners:'聊天对象',simulator:'仿真控制台','kb-guide':'开启键盘','partner-edit':state.modalData&&state.modalData.id?'编辑聊天对象':'新增聊天对象'}[state.appScreen] || 'LoveCo');
    const content=appScreenContent();
    /* 引导流程的整页皮肤要连着状态栏一起换底色（引导页紫蓝、模拟设置 / 详情页黑），
       给手机挂上对应 class，状态栏配色在 theme.css 里跟着走 */
    const guideCls = state.appGate || state.appScreen==='kb-guide'
      ? (state.appScreen==='kb-guide' && state.kbGuidePage!=='guide' ? ' guide-dark' : ' guide-purple') : '';
    const scrollMemo = captureScrolls($('#app'));
    $('#app').innerHTML = `<div class="shell app-workspace">
      <header class="topbar"><div class="brand"><img src="assets/brand/LoveCo_108_108.png" alt="LoveCo"><span class="brand-name">LoveCo</span><span class="brand-tag">主 App 手机模拟器</span></div><div class="top-actions"><span class="sandbox-pill"><i class="dot"></i>本地仿真 · 无真实扣款</span><button class="text-button" data-action="reset">重置会话</button></div></header>
      <main class="workspace"><aside class="rail left-rail"><div class="rail-section"><div class="eyebrow">LOVECO / APP</div><div class="rail-heading"><h2>主 App</h2></div>${deviceSwitchers()}</div>${permissionSection()}<div class="rail-section"><div class="rail-heading"><h2>模拟</h2></div>${simControls()}${simShotButton()}</div></aside>
        <section class="device-column"><div class="device-top"><span>${icon('Cellphone')}${platformName()} · 主 App 模式</span><span><i class="dot"></i>${state.loggedIn?'已登录':'未登录'}</span></div><div class="phone app-phone${state.dark?' dark':''}${guideCls}" data-platform="${state.platform}">${LoveCoUI.render('status-bar', ctx)}<div class="app-shell"><main class="app-main">${content}</main>${appTabBar()}${state.kbFullAccess?LoveCoUI.render('kb-full-access', ctx):''}${state.kbLogin?LoveCoUI.render('kb-login', ctx):''}${state.kbPaywall?LoveCoUI.render('kb-paywall', ctx):''}${state.kbLegal?LoveCoUI.render('kb-legal', ctx):''}</div>${state.shotFlash?'<div class="shot-flash" aria-hidden="true"></div>':''}${state.appLegal?legalSheet('app-legal-close'):''}</div><div class="device-caption">LoveCo<span></span>com.gasairea.loveco<span></span>MAIN APP</div>${pageDetail()}<div class="mobile-testbar"><div class="testbar-switchers">${surfaceButtons()}${platformButtons()}</div><button class="icon-btn" title="仿真设置" aria-label="仿真设置" data-action="simulator">${icon('Monitor')}</button><button class="icon-btn" title="重置会话" aria-label="重置会话" data-action="reset">${icon('RefreshLeft')}</button></div></section><aside class="rail right-rail">${pageListSection()}<div class="rail-section"><div class="eyebrow">APP STATE</div><div class="kv"><span>App形态</span><strong>主 App 模式</strong></div><div class="kv"><span>当前页面</span><strong>${esc(title)}</strong></div><div class="kv"><span>运行平台</span><strong>${platformName()}</strong></div><button class="row-button" data-action="simulator">${icon('Monitor')}仿真控制台<span class="end">${icon('ArrowRight')}</span></button></div></aside></main>
    </div>`;
    bind();
    /* 引导流程的演示动画：每次重建 DOM 后重新接一遍「拿到手势就开声音」（见 wireGuideVideos） */
    wireGuideVideos();
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
      <header class="topbar"><div class="brand"><img src="assets/brand/LoveCo_108_108.png" alt="LoveCo"><span class="brand-name">LoveCo</span><span class="brand-tag">键盘交互实验室</span></div>
      <div class="top-actions"><span class="sandbox-pill"><i class="dot"></i>本地仿真 · 无真实扣款</span><button class="text-button" data-action="reset">重置会话</button></div></header>
      <main class="workspace">
        <aside class="rail left-rail"><div class="rail-section"><div class="rail-heading"><h2>会话工作台</h2></div>${deviceSwitchers()}</div>
        ${permissionSection()}
        <div class="rail-section"><div class="rail-heading"><h2>模拟</h2></div>${simControls()}${simShotButton()}</div></aside>
        <section class="device-column"><div class="device-top"><span>${icon('Cellphone')}${platformName()} · 键盘模式 · 宿主 App 内</span><span><i class="dot"></i>${state.loggedIn?'已登录':'未登录'}</span></div>
          <div class="phone host-wechat ${state.dark?'dark':''}" id="phone" data-platform="${state.platform}">
            ${LoveCoUI.render('status-bar', ctx)}
            ${LoveCoUI.render('host-app', ctx)}
            ${keyboardSection}
            ${state.shotFlash?'<div class="shot-flash" aria-hidden="true"></div>':''}
            ${voiceHoldOverlay()}
            ${state.modal?renderModal():''}
          </div>
          <div class="device-caption">LoveCo<span></span>com.gasairea.loveco<span></span>KEYBOARD · HOST APP</div>
          ${pageDetail()}
          <div class="mobile-testbar"><div class="testbar-switchers">${surfaceButtons()}${platformButtons()}</div><button class="icon-btn" title="仿真设置" aria-label="仿真设置" data-action="simulator">${icon('Monitor')}</button><button class="icon-btn" title="重置会话" aria-label="重置会话" data-action="reset">${icon('RefreshLeft')}</button></div>
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
  }
  /* 「模拟」组（两种 App形态的左栏都渲染；窄屏是「仿真控制台」弹层）的三个仿真开关：
     登录状态 / 模拟额度耗尽 / 模拟安全拦截（2026-09-27 起主 App 形态左栏也用这一节 —— 与「设备权限」同理，
     这些仿真都是「设备级」的，切到主 App 也能直接切登录态 / 额度 / 拦截，不必先回键盘形态）。
     原「请求结果」下拉已删除（见 state.outcome 注释），三条都是同一格式的 control-line + 开关。
     多处同时渲染时靠前缀区分控件 id（见 state.renderedControls）。
     底部一行「语音指令」下拉是按住面板麦克风时说的那句话（见 VOICE_QUERIES，只有一档）——
     它是「输入内容的仿真」，与上面三条开关一样只在本地生效。 */
  function simControls() {
    const prefix=state.renderedControls?'sim-dialog-':'sim-';state.renderedControls=true;
    const markup=`<div class="control-line"><label for="mock-login">登录状态</label><input id="mock-login" class="switch" type="checkbox" ${state.loggedIn?'checked':''}></div>
   <div class="control-line"><label for="mock-credits">模拟额度耗尽</label><input id="mock-credits" class="switch" type="checkbox" ${state.creditsOut?'checked':''}></div>
   <div class="control-line"><label for="mock-block">模拟安全拦截</label><input id="mock-block" class="switch" type="checkbox" ${state.outcome==='blocked'?'checked':''}></div>
   <div class="control-line"><label for="mock-voice">语音指令</label><select id="mock-voice" title="按住聊天分析面板的麦克风时说的那句话，AI 按它重新生成（AI 通用回复）">${Object.entries(VOICE_QUERIES).map(([id,q])=>`<option value="${id}"${state.voiceQuery===id?' selected':''}>${q.label}</option>`).join('')}</select></div>`;
    return markup.replace(/(id|for)="(mock-login|mock-credits|mock-block|mock-voice)"/g,(_,attribute,id)=>`${attribute}="${prefix+id}"${attribute==='id'?` data-control="${id}"`:''}`);
  }
  /* 「模拟」组底部的「模拟截屏」（两种形态的左栏与「仿真控制台」弹层三处同名按钮，都走 sim-screenshot）：
     它不是开关，而是「按一下发生一件事」的按钮 —— 一次系统截屏键的仿真，
     后果按键盘此刻是否激活分两条路（见 takeScreenshot）。
     右侧小字是待分析提示位的状态：有截图挂着（等键盘唤起 / 等三关通过）时标出来，
     免得只看手机不知道还有一张截图在等着分析。 */
  function simShotButton() {
    const end=state.pendingShot?'<span class="end">待分析 1 张</span>':'';
    return `<button class="row-button" data-action="sim-screenshot">${icon('Picture')}模拟截屏${end}</button>`;
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
  /* 通用底部卡片（sheet）。closeAction 是右上角 X 的动作，默认 'close'（各弹层的通用关闭）；
     协议正文覆盖层用 'app-legal-close' —— 它不参与 appScreen 的页面栈，只收自己这一层。 */
  const sheet = (title,body,footer='',closeAction='close') => `<div class="modal-backdrop"><section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="sheet-handle"></div><div class="sheet-header"><h2>${title}</h2>${ib('Close','关闭弹窗',closeAction)}</div><div class="sheet-content">${body}</div>${footer?`<div class="sheet-footer">${footer}</div>`:''}</section></div>`;
  /* 协议正文卡片：2026-09-26 起主 App 的协议正文不再是独立页面（原 /legal/:key 已从页面列表删除），
     而是浮在页面上的**覆盖层**（state.appLegal，渲染挂点在 renderApp 里、.phone 末尾）——
     正文与键盘内 kb-legal 同一份快照（legal-data.js），关闭动作由调用方给（主 App = app-legal-close）。 */
  function legalSheet(closeAction) {
    const d=window.LOVECO_LEGAL[state.legalKey];
    return sheet(esc(d?.title||d?.name||'协议正文'),`<p class="hint-banner">项目内置协议快照；模拟器本身不提供真实付费服务。</p><div class="legal-text">${esc(d?.body||'暂未载入正文')}</div>`,primary('返回',closeAction,'ArrowLeft'),closeAction);
  }
  function renderModal() {
    const m = state.modal;
    if (m==='simulator') return sheet('仿真控制台',`<div class="hint-banner">所有接口在当前页面内模拟。不会发送短信、上传图片或发起真实交易。</div>${simControls()}<div class="button-pair"><button class="secondary" data-action="incoming">收到新消息</button><button class="secondary" data-action="sim-screenshot">模拟截屏</button></div><button class="text-button" data-action="reset">重置全部本地仿真数据</button>`);
    /* 说明：对象列表（partners）与对象新增 / 编辑（partner-edit）两个屏已归属「对象」Tab，
       一律由 appScreenContent 直接渲染整页（appPartnersPage / partnerEditor），不在这里出分支；
       另外「我的」（account）也同样走 appAccountPage。这里只留子页的 sheet 卡片。
       原「键盘设置」（settings）与「确认模拟订单 / 权益已到账 / 模拟订单 / 兑换积分 / 我的反馈 /
       协议正文」各页的分支已于 2026-09-26 按需求删除（协议正文改走 legalSheet 覆盖层）；
       同日稍后「登录 LoveCo」「会员与积分」两页也删除 —— 登录改弹键盘同款登录覆盖层
       （kb-login 组件，见 openKbLogin / needLogin），会员开通改弹键盘同款付费覆盖层
       （kb-paywall 组件，见 openPaywall），都不再是这里的 sheet 卡片。 */
    if (m==='profile') return sheet('个人资料',`<label class="field">昵称<input id="profile-name" maxlength="20" value="${esc(state.nickname)}"></label><label class="field">性别<select id="profile-gender">${['暂不设置','女','男'].map(v=>`<option ${state.gender===v?'selected':''}>${v}</option>`).join('')}</select></label><label class="field">年龄段（选填）<select id="profile-age">${['暂不设置','18–22','23–30','31–40','40以上'].map(v=>`<option ${state.age===v?'selected':''}>${v}</option>`).join('')}</select></label>`,primary('保存资料','save-profile','Check'));
    /* 反馈类型支持预选（state.modalData.type）：「我的 · 键盘内容投诉与举报」进来时预选「举报」 */
    if (m==='feedback') return sheet('反馈与建议',`<div class="hint-banner">我们将及时受理、处理您的投诉或举报，并反馈处理结果。</div><label class="field">反馈类型<select id="feedback-type">${['功能问题','键盘问题','AI效果','建议','投诉','举报'].map(t=>`<option ${state.modalData.type===t?'selected':''}>${t}</option>`).join('')}</select></label><label class="field">详细说明<textarea id="feedback-text" maxlength="500" placeholder="请描述遇到的问题，不要填写敏感信息…"></textarea></label>`,primary('提交仿真反馈','submit-feedback','Position'));
    if (m==='legal-list') return sheet('协议中心',Object.entries(window.LOVECO_LEGAL).map(([k,v])=>`<button class="row-button" data-action="legal:${k}">${icon('Document')}<span style="flex:1">${esc(v.title||v.name||k)}</span>${icon('ArrowRight')}</button>`).join(''));
    if (m==='confirm') return sheet(esc(state.modalData.title),`<p class="muted">${esc(state.modalData.message)}</p>`,`<div class="button-pair"><button class="secondary" data-action="close">取消</button><button class="primary" data-action="confirm-action">${state.modalData.label||'确认'}</button></div>`);
    /* 分支覆盖全部合法 m（openModal 白名单 / appScreens），无兜底卡片 */
    return '';
  }
  function openModal(name,data={}) {
    abortVoiceHold();
    /* 主 App 形态：记下这张卡片的来源页（Tab 三页 / 子页），供「取消 / 关闭」回上一层 ——
       主 App 现在有自己的页面栈（不再是「关掉就退回键盘形态」）。走 modalBack 的记法；
       协议正文是另一条独立的覆盖层（state.appLegal，见 openAppLegal），不进这个栈。 */
    if(state.appView==='app'&&state.appScreen&&state.appScreen!==name)state.modalBack={modal:state.appScreen,data:{...state.modalData}};
    state.modal=name;state.modalData=data;
    if(state.appView==='app') state.appScreen=name;
    render();
    const focus = {'partner-edit':'#partner-name',feedback:'#feedback-text'}[name];
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
     （选中过图片时中间还有缩略图行与快捷栏），键区照常在下（标题栏顶替菜单栏、同高，
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
     其余 → AI通用回复。组合串非空时先上屏（与键区那颗蓝键、Enter 一致，不丢未确认的拼音）；
     这一栏只在选中过截图时出现，所以点它必有截图可发。
     state.freeShortcut 只是发送那一刻的入参（sendFreeChat 自己也会清），这里再兜一次 ——
     发送被跳过时也不留下，免得影响下一次从蓝键发出的结果结构。 */
  function pickFreeShortcut(id) {
    if(state.composition)commitComposition();
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
    /* 换页一律收起协议正文覆盖层：它只服务于打开它的那一页 */
    state.appLegal=false;
    state.partnerPanel=false; state.settingsPanel=false; state.photoPanel=false; state.photoBack=''; dismissChatPanel();
    state.appView='app'; state.appScreen=screen; state.modal=screen; state.modalData=data; render();
    const focus = {feedback:'#feedback-text'}[screen];
    if(focus) setTimeout(()=>$(focus)?.focus({preventScroll:true}),30);
  }
  /* 返回键盘形态：从主 App 回来一律落在「键盘常驻」的底座上 —— 收起态只属于宿主会话里的一次收起动作 */
  function returnKeyboard() { abortVoiceHold();dismissKbEditor();dismissFreeChat(); state.appLegal=false; state.kbCollapsed=false; state.partnerPanel=false; state.settingsPanel=false; state.photoPanel=false; state.photoBack=''; dismissChatPanel(); state.appView='keyboard'; state.appScreen=null; state.modal=null; state.modalData={}; state.appGate=''; state.kbGuidePage=''; render(); }
  /* —— 主 App 的启动闸门（进入 / 切入主 App 时都要过一遍）——
     顺序固定：**先网络、后状态检查链**。① 发一次仿真网络请求（api()，走 /mock/net/check 路径 ——
     只是把「检查联网状态」也当成一次本地仿真，请求期间整页停在「正在检查网络…」）：
     「设备权限 › 网络访问」关闭时请求按网络不可用失败，整页换成网络不可用 + 重试；
     ② 网络通着再按状态检查链走一遍（见 appEntryGuards）：键盘权限 → 完全访问权限 → 登录状态，
     哪一环没过就停在对应的引导上，都通过才落首页。
     引导页 / 闸门页都算「主 App 自己的整页」，落在 appScreen='kb-guide' 上（无底部 Tab）。 */
  async function appEntryCheck() {
    state.appView='app'; state.appScreen='home'; state.modal='home'; state.appGate='checking'; state.kbGuidePage='';
    render();
    try { await api('/mock/net/check',{},{response:{ok:true,check:'network',simulated:true}}); }
    catch (_) { state.appGate='nonet'; render(); return; }
    state.appGate='';
    if(appEntryGuards())return;
    render();
  }
  /* —— 主 App 的状态检查链（网络检查通过后按序跑一遍）——
     顺序（2026-09-28 按需求定）：① **键盘权限**（permissions.kbEnabled —— 键盘没启用就整页进
     「开启键盘」引导流程，kbGuidePage='guide'）→ ② **键盘完全访问权限**（iOS / 鸿蒙且未开时
     弹出「键盘完全访问引导页」，它浮在主 App 上；Android 系统上该权限默认开启，跳过这一环）→
     ③ **登录状态**（未登录弹键盘同款登录覆盖层）。通过则检查下一个；没通过就停在对应的引导上
     （返回 true = 已经渲染过，调用方别再渲染）—— 与原来「落首页 + 补弹登录层」的差别就在于
     中间这道完全访问检查，且三层不再同时出现（先权限、后登录，与键盘侧同一套思路）。
     检查点三处：进入主 App（appEntryCheck：?surface=app 启动 / 工作台切 App形态）、
     「开启键盘」引导完成那一刻（finishGuide —— 接着把后两环补完）、左栏「键盘完全访问」开关的
     仿真联动（与键盘侧 checkKbEntry 同一条链）。 */
  function appEntryGuards() {
    if(!state.permissions.kbEnabled){ state.appScreen='kb-guide'; state.modal='kb-guide'; state.kbGuidePage='guide'; render(); return true; }
    if(checkKbFullAccess())return true;
    if(checkKbLogin())return true;
    return false;
  }
  /* 引导页「启用LoveCo输入法」→ 模拟鸿蒙设置「输入法」页 */
  function openGuideSettings() { state.kbGuidePage='settings'; render(); }
  /* 模拟设置页点「LoveCo」行 → LoveCo 输入法详情页（两个开关） */
  function openGuideDetail() { state.kbGuidePage='detail'; render(); }
  /* 模拟设置页 / 详情页的返回箭头：详情回设置、设置回引导页 ——
     退回引导页时若两步已都完成（例如刚在设置页切好输入法），直接完成引导、回首页，
     不让引导页停在「两颗按钮都灰」的死状态 */
  function guideBack() { state.kbGuidePage = state.kbGuidePage==='detail' ? 'settings' : 'guide'; if(finishGuideIfDone())return; render(); }
  /* 模拟设置页「默认输入法」行：点一下在「小艺输入法」与「LoveCo」之间切换（= 在系统里改当前输入法）——
     只能选已启用的输入法（未启用时该行整行不可点），反向切回小艺不影响键盘的启用状态。
     切换本身不结束引导：完成仍在「返回 App」那一刻校验（点悬浮窗或返回箭头，见 guidePipBack / guideBack） */
  function switchGuideIme() {
    const P = state.permissions;
    if(P.ime==='loveco'){ P.ime='system'; return render(); }
    P.ime='loveco'; P.kbEnabled=true;
    render();
  }
  /* 详情页「启用LoveCo」开关 = permissions.kbEnabled（左栏「开启键盘」是同一个开关）：
     打开即键盘已启用，详情页就地显现第二个开关「完整体验模式」、悬浮窗浮出绿色对勾；
     关掉则键盘回到未启用 —— 当前输入法不可能是 LoveCo，顺手复位成系统默认 */
  function toggleGuideEnable() {
    const P=state.permissions;
    P.kbEnabled=!P.kbEnabled;
    if(!P.kbEnabled)P.ime='system';
    if(finishGuideIfDone())return;
    render();
  }
  /* 详情页「完整体验模式」开关（第二个开关，仅第一个打开后显现） */
  function toggleGuideFull() { state.kbGuideFull=!state.kbGuideFull; render(); }
  /* 悬浮窗（画中画）：点它 = 从系统设置**返回 LoveCo App** —— 这里重新校验一遍（guideSatisfied）：
     键盘已启用（安卓还要当前输入法已切成 LoveCo）就直接关闭引导页、完成引导；
     还差一步（安卓下键盘启用了但没切输入法）则退回引导页 —— 这时第一步已灰、
     第二步高亮呼吸，接着做第二步。 */
  function guidePipBack() { if(guideSatisfied()) return finishGuide(); state.kbGuidePage='guide'; render(); }
  /* 引导完成（从系统设置点悬浮窗返回 App）：回主 App 首页 —— 引导只是过了状态检查链的第一环
     （键盘已启用），这里接着把后两环补完（完全访问权限 → 登录状态，见 appEntryGuards），
     都通过才真正停在首页上 */
  function finishGuide() {
    state.kbGuidePage='';
    state.appScreen='home'; state.modal='home'; state.modalData={};
    if(appEntryGuards())return;
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
  /* 主 App 的登录门槛：未登录就弹出**键盘同款的登录覆盖层**（kb-login 组件）——
     原「未登录落登录页」随整页（login）删除一并作废：层浮在当前页上，X / Esc 关掉停原页，
     登录成功（一键 / 短信用同一套链路）收起后也停在原页，用户接着操作即可。 */
  function needLogin() {if(state.loggedIn)return false;openKbLogin();return true;}
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
  /* —— 键盘底部麦克风的语音指令（左栏「模拟 › 语音指令」）——
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
     pendingShot 一直留着，直到点掉它（进入 AI 分析）、再截一张，或从页面列表跳转 / 重置会话。 */
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
    /* 仿真控制台弹层开着时先收起：截屏的后果都发生在手机里，别被弹层挡着
       （主 App 形态下这张表就是「当前页面」本身，不动它 —— 截图照常落进相册，
       回到键盘形态时提示位会按三关判定露脸） */
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
     后者顺带补上「模拟 › 语音指令」选的那句转写，底部「重新生成」在真实链路里复用同一份输入。 */
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
    /* 积分不足的付费引导**只由左栏「模拟额度耗尽」开关触发**（state.creditsOut）：
       开关关着时 App 永远有额度，正常生成不会被拦（额度也不会被自然消耗光，见下面的扣减）。 */
    /* 付费引导两种形态共用同一层（kb-paywall 组件、同一张商品表 PLANS）：
       键盘形态铺满整个键盘区域；主 App 形态浮在主 App 页面上（原「会员与积分」整页已删） */
    if(state.creditsOut&&!state.member&&state.credits<1){openPaywall();return;}
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
      /* 非会员每次生成扣 1 点，但**扣到 1 就停**：额度自然用不完 —— 归零只有「模拟额度耗尽」开关一条路，
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
     按住说出的这句话是给 AI 的指令（左栏「模拟 › 语音指令」选的那句，见 VOICE_QUERIES）：
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
  /* 协议名 → 正文覆盖层（主 App）。协议正文原是一个独立页面（/legal/:key），2026-09-26 按需求
     页面删除后降级成**浮在当前页上的覆盖层**：不动 appScreen、不进页面栈，关掉（X / 返回 / Esc）
     就回原页 —— 所以来源页的一切都原样留着。key 直接取 legal-data.js 的 key
     （原 'user'/'member' 两个内联映射随登录页 / 会员页删除一并去掉）。 */
  function openAppLegal(key) {
    if(!window.LOVECO_LEGAL || !window.LOVECO_LEGAL[key])return;
    abortVoiceHold();
    state.legalKey=key;
    state.appLegal=true;
    render();
  }
  async function action(a) {
    const [name,...rest]=a.split(':');const arg=rest.join(':');
    if(state.paymentBusy)return;
    /* 原「回到聊天」动作（`return-keyboard`，只在「权益已到账」页用过）随该页删除，勿再补回 */
    /* 底部 Tab（首页 / 对象 / 我的）：三页都是 appScreens 里的整页；未登录点 Tab 不切页，
       就地弹出键盘同款的登录覆盖层（原「未登录一律先落登录页」随该整页删除作废）。
       原「我的」小按钮（app-home）与旧 Tab 里的「会员」「键盘」两项随这次重做一起去掉 ——
       会员入口在「我的」的会员横幅上；主 App 已无顶部导航栏，首页清空后主 App 内也没有
       回键盘的入口了，回键盘形态走工作台左栏的 App形态切换。 */
    if(name==='app-tab'){if(!state.loggedIn){openKbLogin();return;}return openAppScreen(arg);}
    if(name==='app-membership'){if(needLogin())return;return openPaywall();}
    /* 「我的」客户支持：键盘内容投诉与举报 → 反馈页并把类型预选成「举报」
       （先清掉反馈页的表单缓存，否则上一次选过的类型会盖掉这次预选）
       —— 原「在线客服」入口（support 动作与页面）已于 2026-09-26 删除 */
    if(name==='report'){
      if(needLogin())return;
      Object.keys(state.formCache).filter(k=>k.startsWith('feedback:')).forEach(k=>delete state.formCache[k]);
      return openAppScreen('feedback',{type:'举报'});
    }
    /* —— 主 App 启动闸门与「开启键盘」引导（appEntryCheck / appKbGuideScreen 那条链路）—— */
  if(name==='app-gate-retry')return appEntryCheck();
  if(name==='kb-guide-settings')return openGuideSettings();
  /* 安卓引导第二步「切换到LoveCo输入法」：与第一步同一个落点 —— 进模拟设置页，
     在里面把「默认输入法」行切到 LoveCo（见 switchGuideIme） */
  if(name==='kb-guide-switch')return openGuideSettings();
  if(name==='kb-guide-ime-switch')return switchGuideIme();
  if(name==='kb-guide-ime')return openGuideDetail();
  if(name==='kb-guide-back')return guideBack();
  if(name==='kb-guide-enable')return toggleGuideEnable();
  if(name==='kb-guide-full')return toggleGuideFull();
  if(name==='kb-guide-pip')return guidePipBack();
  if(name==='surface'){
      if(arg===state.appView)return;
      state.docPage=null;
      /* 切到主 App：落首页；未登录不再落登录页（整页已删），进形态后弹键盘同款的登录覆盖层 */
      /* 切到主 App：不再直接落首页 —— 先过启动闸门（网络检查 → 键盘检查，见 appEntryCheck），
         键盘未开启会整页进「开启键盘」引导；登录层等闸门都过了才弹 */
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
      cancelAI(true);abortVoiceHold();state.platform=arg;state.modal=null;state.photoPanel=false;state.kbCollapsed=false;state.results=[];persist();
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
       主 App / 会话工作台的「键盘设置」弹层里选布局则留在弹层 —— 那里还有深色外观等其它开关，
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
    /* 左栏「设备权限」的当前输入法两档（系统默认 / LoveCo）：选 LoveCo = 在系统里切好了输入法，
       键盘必然是已启用的（未启用的键盘不可能当当前输入法）—— 顺带把「开启键盘」打开；
       若此刻正停在引导流程、两步都已齐，直接完成引导（等价于「返回 App 重新校验」，见 finishGuideIfDone） */
    if(name==='ime'){
      state.permissions.ime=arg;
      if(arg==='loveco')state.permissions.kbEnabled=true;
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
    if(name==='close-free-chat')return closeFreeChat();
    /* 问AI 页图片选择器的四个动作（内嵌形态：网格盖住键区，见 openFreePicker）——
       free-picker = 输入行右端的图片按钮（开 / 关同一枚按钮；展开且已选图时这枚按钮变成
       「发送」，所以开关与补选分别由下面两条走），free-picker-add = 缩略图行尾的「+」
       （展开时再挑一张；收起时也是唯一的补选入口），free-send = 展开时的蓝色发送按钮（箭头），
       free-shortcut:<id> = 快捷栏那一行预设问题 —— **点一下立即发送**，id 决定结果结构。
       缩略图上的移除复用选择器的 photo:<id>（已选中再点即取消，与网格里点同一张等价）。 */
    if(name==='free-picker')return toggleFreePicker();
    if(name==='free-picker-add')return openFreePicker();
    if(name==='free-send')return sendFreeChat();
    if(name==='free-shortcut')return pickFreeShortcut(arg);
    /* 键盘顶部菜单栏的相册图标：从下往上弹出键盘选择器（「选择聊天截图（最多3张）」），
       面板覆盖整个键盘区域，键盘整块拉高到手机屏幕的三分之二（.keyboard.with-picker，见 theme.css）。
       每次打开都从空选择开始。 */
    if(name==='photo-picker')return openPhotoPanel();
    if(name==='close-photo-picker')return closePhotoPanel();
    if(name==='select-partner'){
      /* 第三方 App 是固定聊天模板：切对象不动会话（消息 / 草稿原样保留），只重置键盘侧的生成。
         主 App 形态选完留在「对象」页（这一页就是对象列表）；键盘形态回管理页 */
      cancelAI(true);state.selectedPartner=arg;state.results=[];state.host='';state.partnerPanel=false;
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
    if(name==='confirm-action')return action(state.modalData.action);
    /* 「模拟截屏」（左栏「模拟」/ 仿真控制台的同名按钮）：仿真按一下系统截屏键 ——
       键盘激活就直接进 AI 分析链路；键盘不在屏就只把截图放进相册、等键盘唤起后再提示（见 takeScreenshot） */
    if(name==='sim-screenshot')return takeScreenshot();
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
    if(name==='close-kb-login'){closeKbLogin();return render();}
    /* 协议正文页（kb-legal）：X / Esc 关掉只收起本页、回登录层 —— 协议勾选状态不动 */
    if(name==='close-kb-legal'){closeKbLegal();return render();}
    /* 键盘内付费引导的 X：只收起这一层回键盘（额度仍是 0，再发起生成还会弹） */
    if(name==='kb-paywall-close'){closeKbPaywall();return render();}
    /* 登录层协议行里的协议名：打开键盘内协议正文页（正文与主 App 协议中心同一份 legal-data.js 快照） */
    if(name==='kb-legal'){openKbLegal(arg);return;}
    /* 一键登录页的「手机号登录」入口：就地切成短信验证码形态（不重放滑入动画） */
    if(name==='kb-login-sms'){state.kbLogin='sms';return render();}
    if(name==='kb-login-one-tap'){
      /* 协议未勾选：不静默 return，让底部协议行抖一下提示先勾选（shakeKbConsent） */
      if(!state.kbLoginConsent)return shakeKbConsent();
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
      /* 协议未勾选：与一键登录同一套提示 —— 让底部协议行抖一下（能点到这颗按钮说明手机号 / 验证码已填齐） */
      if(!state.kbLoginConsent)return shakeKbConsent();
      const phone=state.kbLoginPhone.trim(),code=state.kbLoginCode.trim();
      if(!/^1\d{10}$/.test(phone)||code!=='123456')return;
      return runMutation('/v1/auth/sms/login',{phone:phone.slice(0,3)+'****'+phone.slice(-4),code:'[已脱敏]'},()=>{
        /* 登录成功：号码写进「上次登录」，下次唤起键盘弹的是一键登录页（一键登录也用它当本机号） */
        state.phone=phone.slice(0,3)+'****'+phone.slice(-4);
        finishKbLogin();
      });
    }
    /* 退出登录：清掉会话态、落回首页；未登录不再有「登录页」可回（整页已删），
       就地弹出键盘同款的登录覆盖层（改主意可当场再登回来） */
    if(name==='logout'){cancelAI(true);state.accountEpoch++;state.loggedIn=false;state.results=[];persist();state.appView='app';state.appScreen='home';state.modal='home';state.modalData={};openKbLogin();return;}
    if(name==='save-profile'){
      const nick=$('#profile-name').value.trim();if(!nick)return;
      const gender=$('#profile-gender').value,age=$('#profile-age').value;
      return runMutation('/v1/me',{nickname:nick,gender,age},()=>{state.nickname=nick;state.gender=gender;state.age=age;persist();openAppScreen('account');},{method:'PATCH'});
    }
    /* 「注销仿真账户」链路（delete-account 确认框 → delete-account-confirm）已于 2026-09-26
       按需求整体删除：「我的」页不再有这个入口，state.deleted 也随之清除，勿补回。 */
    /* 会员开通覆盖层的三档商品卡：选中即切换 state.kbPlan（主 App 与键盘共用同一个选中态） */
    if(name==='kb-plan'){state.kbPlan=arg;return render();}
    /* 模拟购买：主 App 的会员开通覆盖层与键盘内付费引导共用这一步（同一层、同一张商品表 PLANS）。
       2026-09-26 起「确认模拟订单」「权益已到账」两个中间页删除，点击即走完这次仿真支付、
       权益直接到账（一键到账）—— 按 days 置会员标识与到期日（永久档 0 = 永久），
       并把「模拟额度耗尽」的开关复位（原也在这条链路的最后一步复位）。
       协议行不带勾选框（已按需求去掉）：点「立即解锁」直接购买。
       落点：关掉这一层回原处（键盘形态回键盘、主 App 形态停原页）。 */
    if(name==='purchase'){
      if(state.paymentBusy)return;
      state.paymentBusy=true;
      const item=PLANS[state.kbPlan];
      try {
        await api('/mock/payments/notify',{planId:state.kbPlan,status:'success',actualCharge:0});
        state.member=true;state.memberExpiry=item.days?Date.now()+item.days*86400000:0;
        state.creditsOut=false;state.creditsSnapshot=null;
        state.paymentBusy=false;persist();
        state.kbPaywall=false;return render();
      }catch(e){state.paymentBusy=false;}return;
    }
    if(name==='submit-feedback'){
      const text=$('#feedback-text').value.trim(),type=$('#feedback-type').value;if(text.length<5)return;
      /* 提交成功回「我的」：原落点是「我的反馈」页（该页已随本需求删除，反馈不再留历史列表） */
      return runMutation('/v1/feedback',{type,text},()=>openAppScreen('account'));
    }
    if(name==='legal')return openAppLegal(arg);
    /* 协议覆盖层的 X / 返回 / Esc：只收这一层，回原页（它不进 appScreen 的页面栈） */
    if(name==='app-legal-close'){state.appLegal=false;return render();}
    if(name==='reset')return openModal('confirm',{title:'重置本地仿真？',message:'将清除聊天对象、会话与本地仿真设置，恢复初始测试账户。真实项目数据不受影响。',label:'重置',action:'reset-confirm'});
    if(name==='reset-confirm'){cancelAI(true);abortVoiceHold();try{localStorage.removeItem(STORE);}catch(_){}location.reload();return;}
    /* 原「确认模拟订单 / 权益已到账 / 模拟订单 / 兑换积分 / 我的反馈 / 键盘设置」六个页面已删除，
       各自的动作（checkout / pay / cancel-payment / redeem-submit / tickets）随之移除。 */
    if(['simulator','profile','feedback','legal-list'].includes(name)){
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
  function bind() {
    document.querySelectorAll('[data-action]').forEach(node=>node.addEventListener('click',()=>action(node.dataset.action)));
    bindKbLoginInputs();
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
      if(state.freePicker){state.freePicker=false;render();}
    });
    $('#free-chat')?.addEventListener('scroll',paintComposeMirror);
    $('#free-chat')?.addEventListener('pointerdown',e=>{if(state.freePicker)startFreeVoiceWatch(e);});
    $('#free-chat')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(state.composition)commitComposition();else sendFreeChat();}});
    document.querySelectorAll('[data-control="mock-block"]').forEach(n=>n.addEventListener('change',e=>{state.outcome=e.target.checked?'blocked':'success';render();}));
    /* 「语音指令」下拉：按住聊天分析面板的麦克风时说的那句话（只有一档，AI 按它重新生成） */
    document.querySelectorAll('[data-control="mock-voice"]').forEach(n=>n.addEventListener('change',e=>{state.voiceQuery=e.target.value;render();}));
    /* 「模拟额度耗尽」开关：打开时清零积分 + 去掉会员（原值快照留存），关掉原样还原；
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
    document.querySelectorAll('[data-control="mock-login"]').forEach(n=>n.addEventListener('change',e=>{
      if(state.paymentBusy){render();return;}
      cancelAI(true);state.accountEpoch++;state.loggedIn=e.target.checked;state.results=[];persist();
      /* 主 App 形态（开关在主 App 左栏「模拟」组 /「仿真控制台」弹层里）：登录态变化后不该停在错位的页面上 ——
         登出（关掉开关）落回首页，并按主 App 的状态检查链重查一遍（先完全访问、后登录，见 appEntryGuards 的
         后两环）；重新打开则收起这层登录层、页面原地重渲染（需要登录的子页自己会再拦），
         不借机插权限引导（那不是这次动作的后果）。
         引导流程 / 启动闸门期间不插层（那时还没走到这几环）。 */
      if(state.appView==='app'){
        state.modalData={};
        closeKbLogin();
        if(!state.loggedIn){
          state.appScreen='home';state.modal='home';
          if(state.appGate||state.appScreen==='kb-guide'){render();return;}
          if(checkKbEntry())return;
          render();return;
        }
        render();return;
      }
      /* 键盘在屏时这就是一次「键盘上的前置检查」：先看完全访问、再看登录 —— 没权限弹引导层、
         未登录弹登录层；重新打开（且权限已开）则把两层收起、键盘恢复可用（见 checkKbEntry()） */
      if(state.appView==='keyboard'&&!state.kbCollapsed){closeKbLogin();closeKbFullAccess();if(checkKbEntry())return;return render();}
      render();
    }));
    /* 左栏「设备权限」的开关：蜂窝网络（决定未登录时弹哪张登录页）/ 开启键盘（关掉整块键盘换占位）
       / 键盘完全访问（键盘唤起时的第一道检查；Android 默认开启，只在那里跳过检查） */
    $('#perm-cellular')?.addEventListener('change',e=>{state.permissions.cellular=e.target.checked;render();});
    $('#perm-kb-enabled')?.addEventListener('change',e=>{
      state.permissions.kbEnabled=e.target.checked;
      /* 键盘关掉 = 当前输入法不可能是 LoveCo，复位成系统默认（开启时若两步已齐则直接完成引导） */
      if(!state.permissions.kbEnabled)state.permissions.ime='system';
      if(finishGuideIfDone())return;
      /* 打开 = 键盘刚被启用（等价于一次「键盘被唤起」）：键盘在屏时接着跑前置检查（先完全访问、
         后登录，见 checkKbEntry）—— 默认关的设定下这就是「启用键盘后」的正常入口；
         关掉 = 键盘不在屏，两层覆盖层（完全访问 / 登录）随之收起，不留看不见的残留状态 */
      closeKbLogin();closeKbFullAccess();
      if(state.permissions.kbEnabled&&state.appView==='keyboard'&&!state.kbCollapsed&&checkKbEntry())return;
      /* 主 App 形态同理（同一节控件两形态共用）：键盘刚被启用 = 主 App 的状态检查链刚过第一环，
         接着把后两环补完（完全访问 → 登录，见 appEntryGuards）；引导流程 / 启动闸门期间不插层 */
      if(state.permissions.kbEnabled&&state.appView==='app'&&!state.appGate&&state.appScreen!=='kb-guide'){if(appEntryGuards())return;}
      render();
    });
    $('#perm-kb-full')?.addEventListener('change',e=>{
      state.permissions.keyboard=e.target.checked;
      /* 键盘在屏时这就是一次「键盘上的前置检查」：关掉（= 没在系统设置里开完全访问）即弹引导层；
         重新打开则收起引导层、接着看登录状态（都满足才回键盘）—— 见 checkKbEntry() */
      if(state.appView==='keyboard'&&!state.kbCollapsed){closeKbLogin();closeKbFullAccess();if(checkKbEntry())return;}
      /* 主 App 形态（左栏「设备权限」两形态共用）：同样是「先权限、后登录」的一次重查 ——
         关掉即弹完全访问引导层（铺满主 App 正文区），重新打开则收起引导层、接着看登录状态；
         引导流程 / 启动闸门期间不插层（那时还没走到这一环，见 appEntryGuards） */
      if(state.appView==='app'&&!state.appGate&&state.appScreen!=='kb-guide'){closeKbLogin();closeKbFullAccess();if(checkKbEntry())return;}
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
    /* Esc：主 App 协议覆盖层 / 键盘协议正文页 / 完全访问引导层 / 键盘内登录层压在最上层（后两层互斥），
       先关它们；其次聊天分析面板（生成中=取消本次生成），再轮到各覆盖层 */
    if(e.key==='Escape'){if(state.paymentBusy)return;
      /* 主 App 的启动闸门 /「开启键盘」引导是流程整页：Esc 不提供出口（网络不可用页有「重试」，
         引导流程只能走自己的返回 / 完成动作） */
      if(state.appView==='app'&&(state.appGate||state.appScreen==='kb-guide'))return;
      if(state.appLegal){state.appLegal=false;render();return;}if(state.kbLegal){closeKbLegal();render();return;}if(state.kbLogin){closeKbLogin();render();return;}if(state.kbFullAccess){closeKbFullAccess();render();return;}if(state.kbPaywall){closeKbPaywall();render();return;}if(state.modal)closeModal();else if(state.chatPanel)closeChatAnalysis();else if(state.scanPanel)finishScan();else if(state.photoPanel)closePhotoPanel();else if(state.settingsPanel){state.settingsPanel=false;render();}else if(state.kbEditor){closeKbEditor();render();}else if(state.partnerPanel){state.partnerPanel=false;render();}else if(state.freePicker){closeFreePicker();}else if(state.freeChat){closeFreeChat();}else if(state.pending)cancelAI();return;}
    if(e.key==='Tab'&&state.modal){
      const nodes=[...document.querySelectorAll('.sheet button:not(:disabled),.sheet input,.sheet textarea,.sheet select,.sheet a[href]')].filter(n=>n.offsetParent!==null);
      if(!nodes.length)return;const first=nodes[0],last=nodes.at(-1);
      if(e.shiftKey&&(document.activeElement===first||!$('.sheet').contains(document.activeElement))){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&(document.activeElement===last||!$('.sheet').contains(document.activeElement))){e.preventDefault();first.focus();}
    }
  });
  window.addEventListener('beforeunload',()=>{abortVoiceHold();});
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
