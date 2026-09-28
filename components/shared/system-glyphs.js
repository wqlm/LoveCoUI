/* 系统图形集。icons.js 是生成物、不含这些图形，故在此内联维护。两种风格：
    描边（svg 助手）—— 顶部状态栏（wifi）、键盘底部导航栏（globe / xiaoyi / voice）
      与宿主 App（微信）会话界面（wx*），
      与 theme.css 中 .kb-sysbar svg / .wx-* svg 的 fill:none / stroke:currentColor 配套；
    实心（solid 助手）—— 键盘设置页的布局选项图形（t9 九宫格 / qwerty 全键盘），
      自带 fill:currentColor，颜色直接取所在按钮的 color（选中态即强调色）。 */
(function () {
  'use strict';
  const svg = (paths, extra = '', width = 1.5) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${extra}>${paths}</svg>`;
  const solid = (body, viewBox = '0 0 24 24') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="currentColor">${body}</svg>`;
  /* 九宫格：3×3 圆点，1:1 方形画布 */
  const dots = Array.from({ length: 9 }, (_, i) => `<circle cx="${4.8 + 7.2 * (i % 3)}" cy="${4.8 + 7.2 * Math.floor(i / 3)}" r="2.9"/>`).join('');
  /* 全键盘：按设计图重绘 —— 两排四颗圆角方键 + 底部居中的空格长条，整体在 24×17.4 画布内居中 */
  const keys = (() => {
    const k = 4.4, gap = 1.6, x0 = 0.8, y0 = 1.2;
    const cells = Array.from({ length: 8 }, (_, i) => `<rect x="${(x0 + (i % 4) * (k + gap)).toFixed(2)}" y="${(y0 + Math.floor(i / 4) * (k + gap)).toFixed(2)}" width="${k}" height="${k}" rx="1.2"/>`).join('');
    const barW = 12, barH = 2.8, barY = y0 + 2 * k + gap + 1.8;
    return cells + `<rect x="${((24 - barW) / 2).toFixed(2)}" y="${barY.toFixed(2)}" width="${barW}" height="${barH}" rx="${barH / 2}"/>`;
  })();

  window.LoveCoSystemGlyphs = {
    /* WiFi：顶部状态栏，三端共用 */
    wifi: svg('<path d="M2.6 9.4a14.5 14.5 0 0 1 18.8 0"/><path d="M6 13a9.5 9.5 0 0 1 12 0"/><path d="M9.3 16.6a5 5 0 0 1 5.4 0"/><path d="M12 20.1h.01"/>'),
    /* 地球：切换输入法。鸿蒙、iOS 底栏共用 */
    globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3.2 12h17.6"/><path d="M12 3c2.7 2.7 4.1 5.7 4.1 9s-1.4 6.3-4.1 9c-2.7-2.7-4.1-5.7-4.1-9S9.3 5.7 12 3Z"/>'),
    /* 小艺：鸿蒙键盘底栏右侧的装饰性星芒标识（纯外观，不响应点击） */
    xiaoyi: svg('<path d="M10.4 6.3c1.8 3.3 2.8 4.3 6.1 6.1-3.3 1.8-4.3 2.8-6.1 6.1-1.8-3.3-2.8-4.3-6.1-6.1 3.3-1.8 4.3-2.8 6.1-6.1Z"/><path d="M18.2 3.1c.4.9.9 1.4 1.8 1.8-.9.4-1.4.9-1.8 1.8-.4-.9-.9-1.4-1.8-1.8.9-.4 1.4-.9 1.8-1.8Z"/>'),
    /* 语音输入：iOS 键盘底栏的听写键 */
    voice: svg('<rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"/><path d="M12 18v3.5"/>'),
    /* 键盘设置页的布局选项：九宫格圆点 / 全键盘键位 */
    t9: solid(dots),
    qwerty: solid(keys, '0 0 24 17.4'),
    /* 完全访问引导图上的指示箭头（实心斜箭头，默认指向左上，另一张图由 CSS 旋转镜像）：
       一段 45° 斜线 + 实心箭头尖，颜色取所在元素的 color（引导图里给红色） */
    guide: svg('<path d="M19.6 19.6 8.6 8.6"/><path d="M4.6 4.6h9L4.6 13.6Z" fill="currentColor" stroke="none"/>', '', 2.4),
    /* 星光：键盘选择器「立即分析」按钮上的四角星（实心，颜色取按钮文字色） */
    spark: solid('<path d="M10.8 3.4c1.1 4.2 2.5 5.6 6.7 6.7-4.2 1.1-5.6 2.5-6.7 6.7-1.1-4.2-2.5-5.6-6.7-6.7 4.2-1.1 5.6-2.5 6.7-6.7Z"/><path d="M17.4 2.4c.5 1.9 1.1 2.5 3 3-1.9.5-2.5 1.1-3 3-.5-1.9-1.1-2.5-3-3 1.9-.5 2.5-1.1 3-3Z"/>'),
    /* 安全盾：聊天分析面板拦截态提示上的盾形（描边、内有一枚感叹号，颜色取所在元素的 color） */
    shield: svg('<path d="M12 3 19.2 5.8v5.1c0 4.5-2.9 7.6-7.2 9.3-4.3-1.7-7.2-4.8-7.2-9.3V5.8L12 3Z"/><path d="M12 8.3v4.6"/><path d="M12 15.6h.01"/>'),
    /* 主 App 底部 Tab 栏的三枚图形（同一种描边风格，选中与否只换颜色）：
       首页 = 屋顶 + 门，对象 = 双人形（聊天对象列表），我的 = 单人形 */
    home: svg('<path d="M3.4 10.3 12 3.3l8.6 7"/><path d="M5.5 9.5V20.4h13V9.5"/><path d="M9.8 20.4v-5.2h4.4v5.2"/>'),
    users: svg('<circle cx="9.4" cy="8.2" r="3.5"/><path d="M3.3 20.2c0-3.4 2.7-5.9 6.1-5.9s6.1 2.5 6.1 5.9"/><path d="M16.6 5.6a3.5 3.5 0 0 1 0 5.3"/><path d="M17.6 14.8c1.9.7 3.2 2.8 3.2 5.4"/>'),
    user: svg('<circle cx="12" cy="8" r="3.8"/><path d="M4.6 20.4c0-3.7 3.3-6.6 7.4-6.6s7.4 2.9 7.4 6.6"/>'),

    /* ---- 宿主 App（微信）会话界面：按下图 1:1 绘制的图形 ----
       三组圆形图形按「圆环外径 = 22px」定尺寸：圆环中线 r≈10（画布 24）、描边 1.3（≈1.3px），
       由 theme.css 的 .wx-circle svg 放成 24.8px 实现；内部坐标都按截图量出。 */
    /* 语音消息：圆环 + 小喇叭（实心楔形）+ 两道声波弧 */
    wxVoice: svg('<circle cx="12" cy="12" r="10"/><path d="M8.3 11.1 10 12.3 8.3 13.5Z" fill="currentColor" stroke="none"/><path d="M11.2 8.7A6.4 6.4 0 0 1 11.2 15.9"/><path d="M13.6 6.9A9 9 0 0 1 13.6 17.7"/>', '', 1.3),
    /* 输入框内右侧的麦克风：胶囊 + 拾音弧 + 支杆（外廓 11×14，位于框内右侧） */
    wxMic: svg('<rect x="8.9" y="3.4" width="6.2" height="10" rx="3.1"/><path d="M5.9 11.4a6.1 6.1 0 0 0 12.2 0"/><path d="M12 17.6v3"/>'),
    /* 表情：圆环 + 两眼 + 平顶笑口 */
    wxEmoji: svg('<circle cx="12" cy="12" r="10"/><circle cx="8.5" cy="9.4" r="1.5" fill="currentColor" stroke="none"/><circle cx="15.2" cy="9.4" r="1.5" fill="currentColor" stroke="none"/><path d="M6.4 12.9h11.2a5.6 5.6 0 0 1-11.2 0Z"/>', '', 1.3),
  };
})();

