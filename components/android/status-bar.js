/* Android 顶部状态栏（平台专属组件）。
   从左到右：时间 / 挖孔（圆点）/ 5G / WiFi / 电池（不显示手机卡信号格）。
   与鸿蒙同为圆点挖孔，但保留独立文件：Android 的后续差异直接改这里。 */
LoveCoUI.define('android', 'status-bar', () => {
  const glyph = window.LoveCoSystemGlyphs;
  return `<div class="statusbar"><span>14:32</span><div class="island punch-hole" aria-hidden="true"></div><div class="status-icons"><span>5G</span>${glyph.wifi}<i class="battery"></i></div></div>`;
});
