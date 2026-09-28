/* LoveCo 组件注册表
   键盘模式 UI 被拆成组件，按作用域分目录维护：
     components/shared/   三端共用（改一次，鸿蒙 / Android / iOS 同时生效）
     components/harmony/  鸿蒙实现（覆盖同名共用组件）
     components/android/  Android 实现
     components/ios/      iOS 实现
   渲染时按 ctx.platform 解析：平台实现优先，缺失则回退共用实现；两者都没有则报错，
   避免「某端少画了一块 UI」这种静默失败。

   组件签名：render(ctx) => HTML 字符串（返回 '' 表示该端不渲染此组件）
   ctx 由 app.js 通过 uiContext() 构造，至少包含 { platform, state }。 */
(function () {
  'use strict';
  const SCOPES = ['shared', 'harmony', 'android', 'ios'];
  const registry = { shared: {}, harmony: {}, android: {}, ios: {} };

  /** 注册组件。scope 取 shared / harmony / android / ios，name 为组件名 */
  function define(scope, name, render) {
    if (!SCOPES.includes(scope)) throw new Error(`[LoveCoUI] 未知组件作用域：${scope}（组件 ${name}）`);
    if (typeof render !== 'function') throw new Error(`[LoveCoUI] 组件必须是函数：${scope}/${name}`);
    if (registry[scope][name]) throw new Error(`[LoveCoUI] 组件重复注册：${scope}/${name}`);
    registry[scope][name] = render;
  }

  /** 解析组件：平台实现优先，回退共用实现 */
  function resolve(name, platform) {
    return registry[platform]?.[name] || registry.shared[name] || null;
  }

  /** 渲染单个组件 */
  function render(name, ctx) {
    const component = resolve(name, ctx && ctx.platform);
    if (!component) throw new Error(`[LoveCoUI] 组件未注册：${name}（platform=${ctx && ctx.platform}）`);
    return component(ctx) ?? '';
  }

  /** 组件清单：用于核对某端实际生效的是「平台实现」还是「共用实现」 */
  function inventory(platform) {
    const names = new Set([...Object.keys(registry.shared), ...(registry[platform] ? Object.keys(registry[platform]) : [])]);
    return [...names].map(name => ({
      name,
      scope: registry[platform]?.[name] ? platform : 'shared',
      render: resolve(name, platform),
    }));
  }

  window.LoveCoUI = { define, resolve, render, inventory };
})();
