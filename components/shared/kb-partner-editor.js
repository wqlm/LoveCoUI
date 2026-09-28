/* 新增 / 编辑聊天对象面板 —— 键盘模式下的覆盖层（只占键盘区域的上半）。三端共用。
   皮肤与聊天分析面板 / 选图面板同一套：根节点同时挂 .kb-photo-picker 复用深色皮肤与滑入动画，
   键盘整块拉高到手机屏幕的三分之二（.keyboard.with-picker），面板占上半、下半是键盘
   （样式见 theme.css 的 .kb-partner-editor 一组规则）。
   入口：聊天对象管理页右上角「新建」/ 行内左滑「编辑」—— app.js 按形态分流，键盘模式开本面板，
   主 App 形态仍是弹层（partnerEditor()）。
   出口：右上角 X / Esc（close-kb-editor，先静默落库再回聊天对象管理页）。
   与其它覆盖层互斥：选图选择器 / 聊天对象管理页打开前，本面板先收起
   （app.js 的 dismissKbEditor：先兜底落库再收起，避免它们被后渲染的本面板盖住），
   选择器关闭 / 确定后再按来源弹回本面板（见 kb-photo-picker 的 photoBack）。
   键盘设置页是例外：打开时本面板**不收起** —— 设置页只覆盖下半键盘区域、面板留在上半
   （theme.css 的 .keyboard:has(.kb-partner-editor) .kb-settings），两者上下分区互不重叠，
   在新增 / 修改页面里点设置、切键盘形态，上方编辑区域都不消失。
   布局分上下两部分：**上半是表单面板、下半是键盘** —— 模拟系统键盘弹起把表单顶上去：
   键盘整块拉高到三分之二屏，面板只占上半（键盘总高 − 常规键盘高）；
   下半键盘的菜单栏照常占位，但**只留最右侧的「键盘设置」入口**（对象切换与相册不属于编辑场景，
   由 theme.css 的两条隐藏规则去掉），键区、底栏与平时的键盘一致；
   键区打字时顶部条照旧换成候选词栏（两者同高，键盘高度不跳）。
   贴底与键区定高见 theme.css 的 .keyboard:has(.kb-partner-editor) 一组规则。
   面板内是横向一行：**头像在左**（调小一号的虚线圆槽 +「上传头像」小字，点击进图片选择器的
   avatarMode —— 单选、底部「确定」，见 kb-photo-picker），**备注名 / 关系阶段两行在右**
   （左标签 + 右控件）；备注名输入框外面也套了 .input-wrap + .compose-mirror 画拼音下划线，
   且**打开面板光标就落在备注名、键区打字直接进这个框**（目标切换见 app.js 的 targetValue /
   partnerNameDisplay）；面板里不放「确定」按钮 —— 键区右下角那颗功能键在这个场景就是「确定」
   （按下先兜底落库再回聊天对象管理页，标签与动作见 app.js 的 enterKeyLabel / closeKbEditor）；
   保存本身是静默的（app.js 的 scheduleKbPartnerSave / settleKbPartner）：称呼、关系阶段、
   头像一有变化即自动保存，关闭面板时兜底落库；编辑态也不再放「删除这个对象」（删除只走列表左滑）。
   性别与备注信息已按需求移除（保存时保留对象原有值）。
   本组件只产出结构；表单值由 app.js 的 bind() 实时回存 state.modalData，重渲染不丢。 */
LoveCoUI.define('shared', 'kb-partner-editor', (ctx) => {
  const { esc, icon, ib, state, stages, defaultStage } = ctx;
  const p = state.partners.find(item => item.id === state.modalData.id);
  const draft = state.modalData.avatar ?? p?.avatar ?? '';
  const isEdit = Boolean(p);
  /* 关系阶段档位取自 ctx.stages（初识 / 熟悉 / 暧昧 / 恋人 / 伴侣），新建态预选默认档位「熟悉」 */
  const stage = state.modalData.stage ?? p?.stage ?? defaultStage;
  /* 备注名输入框的显示值由 app.js 算（已确认文字 + 未确认的组合串，见 partnerNameDisplay）：
     打开面板光标就落在备注名上，键区打字直接进这个输入框，不用先点它 */
  const nameValue = ctx.partnerNameDisplay ? ctx.partnerNameDisplay() : (state.modalData.name ?? p?.name ?? '');

  return `<div class="kb-photo-picker kb-partner-editor${state.pickerEnter ? ' entering' : ''}" role="dialog" aria-modal="true" aria-label="${isEdit ? '编辑聊天对象' : '新增聊天对象'}">
    <header class="picker-top">
      <h2>${isEdit ? '编辑聊天对象' : '新增聊天对象'}</h2>
      ${ib('Close', '返回聊天对象', 'close-kb-editor', 'picker-close')}
    </header>
    <div class="picker-body pe-body">
      <button type="button" class="pe-avatar" data-action="avatar-photo-picker" title="选择头像" aria-label="选择头像">
        ${draft ? `<span class="pe-avatar-img"><img src="${esc(draft)}" alt="头像预览"></span>` : `<span class="pe-avatar-ph">${icon('User')}</span>`}
        <span class="pe-avatar-label">${draft ? '更换头像' : '上传头像'}</span>
      </button>
      <div class="pe-fields">
        <label class="pe-field"><span>备注名</span><div class="input-wrap"><div class="compose-mirror" data-mirror="partner-name" aria-hidden="true"></div><input id="partner-name" maxlength="20" value="${esc(nameValue)}" placeholder="输入备注名"></div></label>
        <label class="pe-field"><span>关系阶段</span><select id="partner-stage">${stages.map(v => `<option${v === stage ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
      </div>
    </div>
  </div>`;
});
