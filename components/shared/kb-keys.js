/* 键盘按键区域 —— 五种键盘：26 键中文 / 26 键英文 / 中文九宫格 / 数字 / 符号。三端共用。
   按键输入内容与候选词由 kb-candidates 负责，本组件只画按键矩阵。

   五种键盘的键位（按设计图重排，判定见 core/ime.js 的 layout()）：
     26 键中文：三排字母 + ⇧ / ⌫，键符恒为大写（Q W E R T Y …）；底行是 123 / ， / 空格 / 中英 / 发送；
     26 键英文：同上一套键位，键符默认小写（q w e r …）、按 Shift 变大写，标点键是「.」；
     中文九宫格：左列标点（，。?! 符号）+ 中间 3×3 字母块（@# ABC … WXYZ，只画字母、不带数字）
               + 右列 ⌫ / 换行 / 发送（发送占两行）；底行是 123 / 空格 / 中英；
               打字中左列变成拼音组合列（见下）—— 顶部候选词 + 可滑动的字母组合，@# 变分词 ' 键；
     数字：    左列符号（@ % - + 符号）+ 中间 3×3 数字 + 右列 ⌫ / 空格 / 发送；
               底行是 返回 / 0 / .（返回 = 回字母层），固定九宫格，与语言、布局无关；
     符号：    左列四个分类（常用 / 中文 / 英文 / 表情，点了只换右侧符号，见 app.js 的 symbol-cat）
               + 右侧 4×4 符号面板（用网格线分隔的整块面板，不是一颗颗键帽）；
               底行首键是「返回」（直接回字母层，与数字层一致），其余同 26 键。
   英文只有 26 键这一种布局，中文才有 26 键与九宫格 —— 九宫格里按中/英，键区直接变 26 键；
   数字层固定九宫格，数字只在这一层出现。
   底行的中/英切换键把两个字都画出来：当前语言那个更大、取强调色，另一个变灰（样式在 theme.css）。
   右下角那颗蓝键是**系统功能键（Enter）**：值与动作固定（见 app.js 的 keypress），
   标签随当前输入目标变（app.js 的 enterKeyLabel）—— 宿主聊天输入框是「发送」，
   编辑 / 新增聊天对象的备注名（单行）是「确定」，与系统键盘的回车键随场景换字一致。 */
LoveCoUI.define('shared', 'kb-keys', (ctx) => {
  const { esc, icon, state, enterKeyLabel } = ctx;
  const ime = window.LoveCoIME;

  /* 键区形态：符号层 / 数字层各自固定，字母层由 ime.layout() 派生（英文恒 qwerty） */
  const matrix = state.layer === 'symbols' ? 'symbols'
    : state.layer === 'numbers' ? 'numbers'
    : ime.layout(state) === 't9' ? 't9' : 'qwerty';

  const key = (text, value = text, cls = '', flex = '', label = value) => {
    const body = text.startsWith('<') ? text : esc(text);
    return `<button class="key ${cls}" data-action="key:${esc(value)}"${flex ? ` style="flex:${flex}"` : ''} aria-label="${esc(label)}">${body}</button>`;
  };
  const sendLabel = enterKeyLabel ? enterKeyLabel() : '发送';
  const backspace = (cls = '') => key(icon('Back'), 'Backspace', `func ${cls}`.trim(), '', '退格');
  /* 中/英切换：两个字都在键上，当前语言的更大并取强调色（.lang-opt.active） */
  const langKey = (flex = '1.2') => `<button class="key func lang-key"${flex ? ` style="flex:${flex}"` : ''} data-action="key:language" aria-label="${state.language === 'zh' ? '切换到英文键盘（26 键）' : '切换到中文键盘'}"><span class="lang-opt${state.language === 'zh' ? ' active' : ''}">中</span><span class="lang-opt${state.language === 'en' ? ' active' : ''}">英</span></button>`;
  /* 26 键的底行：123 / 标点 / 空格 / 中英 / 发送（比例取自设计图，总宽约十颗字母键） */
  const bottomRow = (punct) => `<div class="key-row keyboard-bottom-row">${key('123', 'numbers', 'func', '1.8')}${key(punct, punct)}${key('空格', 'Space', 'space', '4')}${langKey()}${key(sendLabel, 'Enter', 'accent', '1.9')}</div>`;
  /* 符号层的底行：首键是「返回」（直接回字母层，与数字层一致），其余同 26 键 */
  const symbolBottomRow = (punct) => `<div class="key-row keyboard-bottom-row">${key('返回', 'letters', 'func', '1.8')}${key(punct, punct)}${key('空格', 'Space', 'space', '4')}${langKey()}${key(sendLabel, 'Enter', 'accent', '1.9')}</div>`;

  if (matrix === 'symbols') {
    /* 符号层的四个分类：每个分类 16 个符号，顺序与设计图的分类列一致 */
    const cats = [
      ['常用', ['，', '。', '？', '！', '@', '.', '\\', '~', '……', '：', '—', '+', '-', '*', '#', '/']],
      ['中文', ['、', '；', '“', '”', '‘', '’', '（', '）', '《', '》', '【', '】', '〈', '〉', '…', '·']],
      ['英文', [',', '.', '?', '!', ':', ';', '"', "'", '(', ')', '[', ']', '{', '}', '&', '%']],
      ['表情', ['😀', '😄', '😊', '🥰', '😍', '🤔', '😅', '😂', '🙌', '👍', '👏', '🎉', '❤️', '🌙', '⭐', '✨']],
    ];
    const active = cats.some(([name]) => name === state.symbolCat) ? state.symbolCat : cats[0][0];
    const cells = cats.find(([name]) => name === active)[1];
    return `<div class="keys sym-layout">
      <div class="sym-grid">
        <div class="sym-cats">${cats.map(([name]) => `<button class="sym-cat${name === active ? ' active' : ''}" data-action="symbol-cat:${esc(name)}" aria-pressed="${name === active}">${esc(name)}</button>`).join('')}</div>
        <div class="sym-keys">${cells.map(c => key(c, c, 'sym-key')).join('')}</div>
      </div>${symbolBottomRow('，')}</div>`;
  }

  if (matrix === 'numbers') {
    /* 数字键盘：左列是符号、底行第一颗是「返回」（回字母层）；发送仍占右列两行 */
    const punct = ['@', '%', '-', '+'];
    return `<div class="keys t9-layout"><div class="t9-grid">
      <div class="t9-punct">${punct.map(c => key(c, c, 'func')).join('')}${key('符号', 'symbols', 'func')}</div>
      <div class="t9-blocks">${['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(c => key(c)).join('')}</div>
      <div class="t9-bottom">${key('返回', 'letters', 'func', '1')}${key('0', '0', '', '1')}${key('.', '.', '', '1')}</div>
      ${backspace('t9-back')}
      ${key('空格', 'Space', 'space t9-mid')}
      ${key(sendLabel, 'Enter', 'accent t9-send')}
    </div></div>`;
  }

  if (matrix === 't9') {
    /* 中文九宫格：字母块只画字母（ABC / DEF …，不带数字），数字与符号各有自己的层。
       打字中（组合串非空）按设计图切形态：
         左列的标点键换成「拼音组合列」—— 顶上是第一个候选词（点了直接上屏），
         下面是当前数字串能推出的拼音字母组合（t9-paths，可上下滑动），点一条切换；
         @# 键换成「分词 '」键（在已输入的拼音后面加分词符）；
         底行 123 前面补一颗「符号」。 */
    const typing = /^[2-9']/.test(state.composition);
    const paths = typing ? ime.t9Paths(state.composition) : [];
    const pathIdx = Math.min(state.t9Path || 0, Math.max(0, paths.length - 1));
    const activePath = paths.length ? paths[pathIdx].replace(/'/g, '') : state.composition;
    const firstCand = typing ? ime.candidates(activePath)[0] || activePath : '';
    /* 顶格候选词只在真有候选词时才画 —— 词典兜底会把字母组合自己当成候选词（如 a / e），
       那样顶格与列表第一项重复，看着像多出一个字母 */
    const candBox = firstCand && firstCand !== activePath
      ? `<button class="t9-path-cand" data-action="candidate:0" aria-label="上屏 ${esc(firstCand)}">${esc(firstCand)}</button>`
      : '';
    const punctCol = typing
      ? `<div class="t9-paths">${candBox}<div class="t9-path-list">${paths.map((p, i) => `<button class="t9-path${i === pathIdx ? ' active' : ''}" data-action="t9-path:${i}">${esc(p)}</button>`).join('')}</div></div>`
      : `<div class="t9-punct">${['，', '。', '?', '!'].map(c => key(c, c, 'func')).join('')}${key('符号', 'symbols', 'func')}</div>`;
    /* 非打字态首键是 @#（进符号层），打字态换成「分词」：直接写这两个字（而不是 ' 符号），
       点了在当前拼音后加分隔符（如 n'i） */
    const segKey = typing ? key('分词', 'seg', 't9-seg', '', '分词') : key('@#', 'symbols');
    const blocks = [segKey].concat([['ABC', '2'], ['DEF', '3'], ['GHI', '4'], ['JKL', '5'], ['MNO', '6'], ['PQRS', '7'], ['TUV', '8'], ['WXYZ', '9']].map(([face, value]) => key(face, value)));
    const bottom = typing
      ? `${key('符号', 'symbols', 'func', '1')}${key('123', 'numbers', 'func', '1')}${key('空格', 'Space', 'space', '1.7')}${langKey('0.75')}`
      : `${key('123', 'numbers', 'func', '1')}${key('空格', 'Space', 'space', '1.7')}${langKey('0.75')}`;
    return `<div class="keys t9-layout"><div class="t9-grid">
      ${punctCol}
      <div class="t9-blocks">${blocks.join('')}</div>
      <div class="t9-bottom">${bottom}</div>
      ${backspace('t9-back')}
      ${key('换行', 'Newline', 'func t9-mid')}
      ${key(sendLabel, 'Enter', 'accent t9-send')}
    </div></div>`;
  }

  /* 26 键：中文键符恒为大写，英文默认小写、按 Shift 变大写 */
  const upper = state.language === 'zh' || state.shift;
  return `<div class="keys qwerty-layout">
    ${['qwertyuiop', 'asdfghjkl', 'zxcvbnm'].map((row, i) => `<div class="key-row${i === 1 ? ' row-inset' : ''}">${i === 2 ? key(icon('ArrowUp'), 'Shift', 'func', '1.5', '切换大小写') : ''}${[...row].map(c => key(upper ? c.toUpperCase() : c)).join('')}${i === 2 ? key(icon('Back'), 'Backspace', 'func', '1.5', '退格') : ''}</div>`).join('')}
    ${bottomRow(state.language === 'en' ? '.' : '，')}</div>`;
});
