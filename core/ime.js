/* 输入法内核（演示级，不是真实 IME 引擎）
   候选词计算与布局归属都与 UI 无关，因此放在 core 而不是某个组件里：
     - 候选词栏组件用它渲染候选（components/shared/kb-candidates.js）
     - app.js 的输入法逻辑用它取「确认输入」的默认词
     - 键区组件用它决定画哪种布局（components/shared/kb-keys.js）
   词典为硬编码映射，见 README「已知边界」。 */
(function () {
  'use strict';

  const pinyin = {
    ni:['你','呢','泥'],hao:['好','号','浩'],nihao:['你好','你好吗'],wo:['我','握','窝'],women:['我们','我门'],
    xiang:['想','像','向'],nihaoma:['你好吗'],xiexie:['谢谢','谢了'],xihuan:['喜欢','喜爱'],ai:['爱','哎'],shi:['是','时','事'],
    de:['的','得','地'],zai:['在','再'],bu:['不','步'],keyi:['可以','可意'],haode:['好的','好得'],wanan:['晚安','万安'],
    mingtian:['明天','明田'],jintian:['今天','金田'],kaixin:['开心','开新'],haoya:['好呀','好呀！'],pei:['陪','配'],zou:['走','奏'],
    ke:['可','课','克','科','客'],le:['了','乐','勒'],jian:['见','件','间'],dao:['到','道'],la:['啦','拉'],ba:['吧','八']
  };
  const t9 = {'64':['你','呢'],'426':['好','号'],'96':['我'],'64426':['你好'],'94264':['想','向'],'9426426':['想你了'],'943943':['谢谢']};
  /* 九宫格数字 → 字母；T9 打字时输入的是数字串，展示与候选都基于它推出的拼音字母组合 */
  const t9Letters = {'2':'abc','3':'def','4':'ghi','5':'jkl','6':'mno','7':'pqrs','8':'tuv','9':'wxyz'};
  /* 常见拼音音节表（演示级）：用来判断某个字母串是不是合法拼音（或合法拼音的前缀）。
     九宫格按键组合会推出大量无意义的字母串（如 53 → jf），只有落在音节表 /
     词典键上的组合才展示给用户（与真实输入法一致）。 */
  const syllables = new Set(('a ai an ang ao ba bai ban bang bao bei ben beng bi bian biao bie bin bing bo bu '+
    'ca cai can cang cao ce cen ceng cha chai chan chang chao che chen cheng chi chong chou chu chuai chuan chuang chui chun chuo ci cong cou cu cuan cui cun cuo '+
    'da dai dan dang dao de dei deng di dian diao die ding diu dong dou du duan dui dun duo e ei en eng er i u v '+
    'fa fan fang fei fen feng fo fou fu ga gai gan gang gao ge gei gen geng gong gou gu gua guai guan guang gui gun guo '+
    'ha hai han hang hao he hei hen heng hong hou hu hua huai huan huang hui hun huo '+
    'ji jia jian jiang jiao jie jin jing jiong jiu ju juan jue jun '+
    'ka kai kan kang kao ke ken keng kong kou ku kua kuai kuan kuang kui kun kuo '+
    'la lai lan lang lao le lei leng li lia lian liang liao lie lin ling liu long lou lu luan lun luo '+
    'ma mai man mang mao me mei men meng mi mian miao mie min ming miu mo mou mu '+
    'na nai nan nang nao ne nei nen neng ni nian niang niao nie nin ning niu nong nu nuan nuo '+
    'o ou pa pai pan pang pao pei pen peng pi pian piao pie pin ping po pou pu '+
    'qi qia qian qiang qiao qie qin qing qiong qiu qu quan que qun '+
    'ran rang rao re ren reng ri rong rou ru ruan rui run ruo '+
    'sa sai san sang sao se sen sha shai shan shang shao she shei shen sheng shi shou shu shua shuai shuan shuang shui shun shuo si song sou su suan sui sun suo '+
    'ta tai tan tang tao te teng ti tian tiao tie ting tong tou tu tuan tui tun tuo '+
    'wa wai wan wang wei wen weng wo wu xi xia xian xiang xiao xie xin xing xiong xiu xu xuan xue xun '+
    'ya yan yang yao ye yi yin ying yo yong you yu yuan yue yun '+
    'za zai zan zang zao ze zei zen zeng zha zhai zhan zhang zhao zhe zhen zheng zhi zhong zhou zhu zhua zhuai zhuan zhuang zhui zhun zhuo zi zong zou zu zuan zui zun zuo').split(' '));
  /* 字母串是否是某个拼音音节 / 词典键的前缀（九宫格展开时用来剪枝） */
  function pinyinPrefix(seq) {
    for (const s of syllables) if (s.startsWith(seq)) return true;
    return Object.keys(pinyin).some(k => k.startsWith(seq));
  }
  /* 字母串本身是否是完整拼音：完整音节，或词典里的一个键（如 nihao） */
  function pinyinValid(seq) {
    return syllables.has(seq) || Object.hasOwn(pinyin, seq);
  }
  /* 组合排序：词典整词 > 词典词首 > 未命中 —— 64 默认给 ni（你）而不是字母序的 mi */
  function byDictionary(seqs) {
    return seqs
      .map((s, i) => [s, i])
      .sort((a, b) => (dictRank(a[0]) - dictRank(b[0])) || (a[1] - b[1]))
      .map(x => x[0]);
  }
  function dictRank(seq) {
    const keys = Object.keys(pinyin);
    if (keys.some(k => k === seq)) return 0;
    if (keys.some(k => k.startsWith(seq))) return 1;
    return 2;
  }
  /** 九宫格数字串（可含分词符 '）→ 合法拼音字母组合列表。
      每段数字逐位展开成字母，用「是拼音前缀」剪枝，只保留能拼成完整音节的组合；
      没有分词符时，还允许「只解释前几位数字」的前缀组合（既是拼音前缀即可，不必是完整音节）：
      单数字（2 → a b c、4 → g h i）这类还没拼成音节的输入也照样列出全部字母，
      多数字时排在完整组合之后（如 53 → ke le 之后还有 j k），与真实九宫格输入法一致。 */
  function t9Paths(composition = '') {
    const raw = String(composition);
    if (!/^[2-9']+$/.test(raw)) return [];
    /* 单个数字（2–9）：直接就是这一颗键上的字母，顺序与键面一致（2 → a b c、7 → p q r s） */
    if (raw.length === 1) return [...t9Letters[raw]];
    const expand = (seg, complete) => {
      let partials = [''];
      for (const d of seg) {
        const letters = t9Letters[d];
        const next = [];
        for (const p of partials) for (const c of letters) { const s = p + c; if (pinyinPrefix(s)) next.push(s); }
        if (!next.length) return [];
        partials = next;
      }
      /* 完整组合必须是完整拼音；前缀组合（只解释前几位数字）是拼音前缀即可 */
      return byDictionary(partials.filter(complete ? pinyinValid : pinyinPrefix));
    };
    const segs = raw.split("'");
    const full = segs.reduce((acc, seg) => {
      /* 尾随分词符（如 64'）：保留已展开的组合、挂上 ' 等下一段 */
      if (!seg) return acc.map(a => a ? a + "'" : "'");
      const part = expand(seg, true);
      if (!part.length || !acc.length) return [];
      return acc.flatMap(a => part.map(p => a ? a + "'" + p : p));
    }, ['']);
    const out = [...full];
    /* 前缀组合：从整串往下逐位收（n === raw.length 时即「全部数字都只当成声母/韵母的一部分」，
       单数字的 a b c、g h i 就是这么出来的），只要求还是拼音前缀 */
    if (!raw.includes("'")) {
      for (let n = raw.length; n >= 1; n--) {
        for (const p of expand(raw.slice(0, n), false)) if (!out.includes(p)) out.push(p);
      }
    }
    return out;
  }
  /** 当前生效的字母组合：九宫格数字串取选中的那条字母路径（index 由 UI 记，含分词符），
      其余输入（26 键拼音 / 英文）原样返回 —— 候选词与输入框显示统一走这里。 */
  function activePath(composition = '', index = 0) {
    const paths = t9Paths(composition);
    if (!paths.length) return String(composition);
    return paths[Math.max(0, Math.min(index, paths.length - 1))];
  }

  /** 键区该画哪种布局（source of truth）：
      英文只有 26 键（qwerty）这一种布局，中文才有 26 键与九宫格两种 ——
      所以在九宫格里按中/英，键区直接变成 26 键；state.layout 记的始终是「中文键盘」的布局，
      切回中文时随之回到用户选的那种。
      数字键盘（layer === 'numbers'）不在这里决定：它固定是九宫格，只画数字，见 kb-keys.js。 */
  function layout(state = {}) {
    if (state.language === 'en') return 'qwerty';
    return state.layout === 't9' ? 't9' : 'qwerty';
  }

  /* 联想词典：键是「光标前的尾词」（先按两字、再按一字匹配），值是接着可能输入的词。
     演示级覆盖常用聊天尾词；尾词匹配不到时落到 fallbackSuggestions。 */
  const nextMap = {
    '你好':['呀','吗','啊'],'你们':['呢'],'好的':['收到','没问题'],'好呀':['那就这么定'],
    '谢谢':['你','啦'],'不谢':['哈'],'晚安':['好梦','安'],'早上好':['呀'],
    '我在':['忙','呢'],'在吗':['？'],'没事':['的','啦'],'没关系':['的'],
    '明天':['见','再聊'],'今天':['辛苦了','怎么样'],'周末':['有空吗','愉快'],
    '辛苦':['了','啦'],'累':['了'],'下班':['了吗'],'走路':['去'],
    '想':['你','要'],'觉得':['呢'],'喜欢':['的'],'可以':['的'],
    '我':['们','在','想'],'你':['好','呢','说'],'在':['吗','忙'],'没':['关系','事'],
    '晚':['安','上'],'今':['天','晚'],'明':['天'],'周':['末','一'],
  };
  /* 没有上下文 / 尾词没命中时的兜底联想词 */
  const fallbackSuggestions = ['好的','我在','没关系','谢谢','晚安'];
  /** 联想词：按光标前文字的尾词取「接下来可能输入的词」，先两字后一字；
      尾词不在联想词典里时给兜底词表。 */
  function suggestions(context = '') {
    const tail = String(context).slice(-4);
    for (let n = Math.min(2, tail.length); n >= 1; n--) {
      const hits = nextMap[tail.slice(-n)];
      if (hits && hits.length) return hits;
    }
    return fallbackSuggestions;
  }
  /** 依据当前输入串取候选词；空输入时按上下文（光标前的文字）给联想词。
      分词符 ' 只影响九宫格的字母展开，查词前去掉。 */
  function candidates(composition = '', context = '') {
    const value = String(composition).toLowerCase().replace(/'/g, '');
    if (!value) return suggestions(context);
    if (/^\d+$/.test(value)) return t9[value] || [value,'好的','我知道了'];
    return pinyin[value] || Object.entries(pinyin).filter(([k])=>k.startsWith(value)).flatMap(([,v])=>v).slice(0,5).concat(value).slice(0,5);
  }

  window.LoveCoIME = { candidates, layout, t9Paths, activePath };
})();
