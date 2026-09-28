/* 「AI 分析」过渡动画页 —— 点「立即分析」与聊天分析面板（kb-chat-analysis）之间的一段过渡。三端共用。
   展示约 1 秒（app.js 的 SCAN_MS，到点由 finishScan() 原地切到聊天分析面板，Esc 可跳过）：
   顶部居中「正在分析中…」，中央是淡紫取景框（四角）包着的深蓝文档图标（三条横线模拟正文），
   一条白色辉光横线在图标上上下往返扫描 —— 动画与过渡等长（1 秒）。
   皮肤与选图面板（kb-photo-picker）同一套：根节点直接挂 .kb-photo-picker 复用布局与滑入，
   不带平台底栏（与聊天分析面板一致，面板一直铺到屏幕底边；样式见 theme.css 的 .kb-scan 一组规则）。
   过渡期间的上传请求会触发整页重渲染（DOM 重建）：根元素上的 --scan-elapsed（已运行毫秒）
   把扫描线动画拨回原进度，不会跳回起点重新扫。 */
LoveCoUI.define('shared', 'kb-scan', (ctx) => {
  const { state } = ctx;
  const elapsed = state.scanStartedAt ? Math.max(0, Math.round(performance.now() - state.scanStartedAt)) : 0;

  return `<div class="kb-photo-picker kb-scan${state.pickerEnter ? ' entering' : ''}" role="status" aria-label="正在分析中" style="--scan-elapsed:${elapsed}ms">
    <p class="scan-title">正在分析中…</p>
    <div class="scan-stage" aria-hidden="true">
      <i class="scan-corner tl"></i><i class="scan-corner tr"></i>
      <i class="scan-corner bl"></i><i class="scan-corner br"></i>
      <div class="scan-doc"><i></i><i></i><i></i></div>
      <span class="scan-line"></span>
    </div>
  </div>`;
});
