/* 新增 / 编辑聊天对象面板 —— 键盘模式下的覆盖层（只占键盘区域的上半）。三端共用。
   皮肤与聊天分析面板 / 选图面板同一套：根节点同时挂 .kb-photo-picker 复用深色皮肤与滑入动画，
   键盘整块拉高到手机屏幕的三分之二（.keyboard.with-picker），面板占上半、下半是键盘
   （样式见 theme.css 的 .kb-partner-editor 一组规则）。
   入口：聊天对象管理页右上角「新建」/ 行内左滑「编辑」—— app.js 按形态分流，键盘模式开本面板，
   主 App 形态仍是弹层（partnerEditor()）。
   出口：右上角 X 号（2026-10-13 晚些需求：当日的「保存」按钮又改回 X 号，
   点击即落库并退出面板回管理页）/ Esc，共用 close-kb-editor 同一条出口
   （先静默落库再回聊天对象管理页）。
   与其它覆盖层互斥：选图选择器 / 聊天对象管理页打开前，本面板先收起
   （app.js 的 dismissKbEditor：先兜底落库再收起，避免它们被后渲染的本面板盖住），
   选择器关闭 / 确定后再按来源弹回本面板（见 kb-photo-picker 的 photoBack）。
   键盘设置页（齿轮挂在菜单栏里）与本面板不再共存：菜单栏在这个场景整行去掉了，
   键盘形态要切就点底栏那颗地球（switch-keyboard，全键盘 / 九宫格对切）。
   布局分上下两部分：**上半是表单面板、下半是键盘** —— 模拟系统键盘弹起把表单顶上去：
   键盘整块拉高到三分之二屏，面板占「键盘总高 − 常规键盘高 + 菜单栏高」；
   **下半键盘没有菜单栏**（2026-10-13 需求：整行不渲染，空出来的一条高度归表单面板），
   键区、底栏与平时的键盘完全一致（每颗键的大小不变）；
   键区打字时顶上照旧换成候选词栏 —— 候选词栏不是菜单栏、照常出现，
   出现时面板缩回一条菜单栏的高度，键区不上跳。
   贴底与键区定高见 theme.css 的 .keyboard:has(.kb-partner-editor) 一组规则。
   面板内是**竖排居中**（2026-10-13 需求：原先是头像在左、表单在右的横排）：
   **头像在上面一行**（虚线圆槽 +「上传头像」小字，点击进图片选择器的
   avatarMode —— 单选、底部「确定」，见 kb-photo-picker），
   **备注名 / 关系阶段两行在下面、整宽排开**（左标签 + 右控件；头像不再占左侧一列，
   这两个 item 因此比原先长出一截）；备注名输入框外面也套了 .input-wrap + .compose-mirror 画拼音下划线，
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
