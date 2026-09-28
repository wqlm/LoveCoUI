/* LoveCo 组件运行时 · 渲染工具集
   纯函数、不持有状态，app.js 与所有组件文件共用。挂载到 window.LoveCoKit。
   改动此文件会影响全部三端与全部组件，属于最底层的公共依赖。 */
(function () {
  'use strict';
  /** HTML 转义，所有用户可见文本必须经过它 */
  const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /** 图标：取自 icons.js 生成物，缺图标时回退到 ChatDotRound */
  const icon = (name) => `<span aria-hidden="true">${window.LOVECO_ICONS[name] || window.LOVECO_ICONS.ChatDotRound}</span>`;
  /** 图标按钮：data-action 由 app.js 的事件委托统一消费 */
  const ib = (name, title, action, extra = '') => `<button type="button" class="icon-btn ${extra}" title="${esc(title)}" aria-label="${esc(title)}" data-action="${action}">${icon(name)}</button>`;
  /** 主按钮：第三个参数是图标名（传空串 = 这颗按钮不带图标，只出文字） */
  const primary = (label, action, name = 'MagicStick', disabled = false) => `<button type="button" class="primary full" data-action="${action}" ${disabled ? 'disabled' : ''}>${name ? icon(name) : ''}${label}</button>`;
  /** 头像：只接受 data:image 内联图片，其余走首字兜底 */
  const avatar = (name, color = '', image = '') => {
    const safeImage = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image);
    return `<span class="avatar ${esc(color)}">${safeImage ? `<img src="${image}" alt="${esc(name)}的头像">` : esc(name.slice(0, 1))}</span>`;
  };
  /** 「不选择」占位头像：虚线空槽 + 中性用户图标，表示没有具体聊天对象（样式见 theme.css 的 .avatar.none） */
  const noneAvatar = () => `<span class="avatar none" aria-hidden="true">${icon('User')}</span>`;
  /** 平台展示名 */
  const platformName = (platform) => ({ harmony: 'HarmonyOS', android: 'Android', ios: 'iOS' }[platform] || 'HarmonyOS');
  /** 聊天截图缩略图：聊天类样例画成深色聊天截图（设计图里的样子，最多画 3 条气泡），
      图片类样例直接铺图。选图面板（kb-photo-picker）的网格缩略图用这套画法。 */
  const shot = (s) => {
    if (s.image) return `<img src="${s.image}" alt="${esc(s.name)}">`;
    const lines = (Array.isArray(s.messages) ? s.messages : []).slice(0, 3).map((text, i) => i % 2
      ? `<span class="shot-line out"><span class="shot-bubble">${esc(text)}</span><i class="shot-avatar"></i></span>`
      : `<span class="shot-line"><i class="shot-avatar"></i><span class="shot-bubble">${esc(text)}</span></span>`).join('');
    return `<span class="shot-chat">${lines}<span class="shot-time">${esc(s.time || '')}</span></span>`;
  };
  /** 方形真缩略图（data URL）：把同一张聊天截图用 canvas 画成一张**真位图**，
      给菜单栏「待分析截图」用 —— 那里只有一枚图标那么大（28×28），DOM 拼的 3:4 卡片
      缩进去后气泡文字会从卡片里溢出来（整段聊天塞不进 6px 的字号里），所以改成直接
      画一张图：版式仍与选图面板的卡片同源，画布按 cover 居中裁成方形（真机系统缩略图
      就是这个做法）。同一张只画一次，取用方见 app.js 的 shotThumbImage()。 */
  const shotThumb = (s, size = 112) => {
    const design = { w: 72, h: 96 };            /* 与 .shot-chat 卡片一致的设计尺寸（3:4） */
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const d = canvas.getContext('2d');
    if (!d) return '';
    const roundRect = (x, y, w, h, r) => {
      d.beginPath();
      d.moveTo(x + r, y);
      d.arcTo(x + w, y, x + w, y + h, r);
      d.arcTo(x + w, y + h, x, y + h, r);
      d.arcTo(x, y + h, x, y, r);
      d.arcTo(x, y, x + w, y, r);
      d.closePath();
    };
    d.fillStyle = '#141417';
    d.fillRect(0, 0, size, size);
    d.save();
    d.translate(0, (size - design.h * (size / design.w)) / 2);   /* 3:4 → 1:1：上下各裁掉一小条 */
    d.scale(size / design.w, size / design.w);
    d.font = '6px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    d.textBaseline = 'top';
    /* 按字符折行（中文为主），最多 4 行，超出交给画布裁掉 */
    const wrap = (text, max, limit = 4) => {
      const lines = [];
      let line = '';
      for (const ch of String(text)) {
        if (line && d.measureText(line + ch).width > max) {
          lines.push(line);
          line = ch;
          if (lines.length === limit) return lines;
        } else line += ch;
      }
      if (line && lines.length < limit) lines.push(line);
      return lines;
    };
    const messages = (Array.isArray(s.messages) ? s.messages : []).slice(0, 3);
    let y = 14;                                  /* 起始留白：方形裁切从 y=12 开始，第一条不被削掉顶边 */
    messages.forEach((text, i) => {
      const out = i % 2 === 1;
      const lines = wrap(text, 28);
      const lh = 9.6;
      const bh = lines.length * lh + 6;
      const bw = Math.min(40, (lines.length ? Math.max(...lines.map(l => d.measureText(l).width)) : 0) + 12);
      const bx = out ? 47 - bw : 25;              /* 左：头像 14 + 间距 4；右：气泡贴到文本框右缘 */
      roundRect(bx, y, bw, bh, 5);
      d.fillStyle = out ? '#E4576F' : '#2A2A2F';
      d.fill();
      d.fillStyle = out ? '#FFFFFF' : '#DDDDE3';
      lines.forEach((line, li) => d.fillText(line, bx + 6, y + 3 + li * lh));
      d.beginPath();
      d.arc(out ? 58 : 14, y + 7, 7, 0, Math.PI * 2);
      d.fillStyle = '#35353B';
      d.fill();
      y += Math.max(14, bh) + 6;
    });
    d.restore();
    return canvas.toDataURL('image/png');
  };

  window.LoveCoKit = { esc, icon, ib, primary, avatar, noneAvatar, platformName, shot, shotThumb };
})();
