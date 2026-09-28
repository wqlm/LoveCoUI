/* iOS 顶部状态栏（平台专属组件）。
   从左到右：时间 / 挖孔（灵动岛药丸）/ 5G / WiFi / 电池（不显示手机卡信号格）。
   与鸿蒙、Android 的差别只是挖孔形态，样式见 theme.css 的 .statusbar .island。 */
LoveCoUI.define('ios', 'status-bar', () => {
  const glyph = window.LoveCoSystemGlyphs;
  return `<div class="statusbar"><span>14:32</span><div class="island dynamic-island" aria-hidden="true"></div><div class="status-icons"><span>5G</span>${glyph.wifi}<i class="battery"></i></div></div>`;
});
